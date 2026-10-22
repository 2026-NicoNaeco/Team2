const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('보드 API 인증·권한·버전·소프트 삭제·응답 정보', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tteonayo-boards-'));
  process.env.TTEONAYO_DB_PATH = path.join(dir, 'db.json');
  process.env.JWT_SECRET = 'test-secret-only-for-board-api';
  process.env.DATABASE_URL = '';
  const app = require('../src/index');
  const boardService = require('../src/boardService');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = 'GET', body, token) {
    const response = await fetch(base + route, { method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  async function signup(index) {
    const result = await request('/api/auth/signup', 'POST',
      { email: `board-${index}-${Date.now()}@example.com`, password: 'password1', name: `회원${index}` });
    assert.equal(result.status, 201);
    return result.body;
  }

  try {
    const users = await Promise.all([1, 2, 3, 4, 5, 6].map(signup));
    const [owner, editor, viewer, fourth, fifth, stranger] = users;
    const data = { schemaVersion: 1,
      cards: [{ id: 'card-1', day: '1일차', title: '장소', description: '', top: 1, left: 2,
        imageUrl: 'data:image/png;base64,AAAA' }], connections: [],
      tripMeta: { region: '순천', partySize: 2 }, tripPlaces: [] };
    const initial = { title: '순천 여행', data };
    assert.equal((await request('/api/boards')).status, 401);
    assert.equal((await request('/api/boards', 'POST', initial)).status, 401);
    const made = await request('/api/boards', 'POST', { ...initial, ownerId: stranger.user.id }, owner.token);
    assert.equal(made.status, 201);
    const boardId = made.body.board.id;
    assert.equal(made.body.board.ownerId, owner.user.id);
    assert.equal(made.body.board.role, 'owner');
    assert.deepEqual(made.body.board.data, data);
    assert.equal(made.body.board.members[0].nickname, owner.user.name);
    assert.equal(JSON.stringify(made.body).includes(owner.user.email), false);

    const nonexistent = '00000000-0000-4000-8000-000000000000';
    const hidden = await request(`/api/boards/${boardId}`, 'GET', undefined, stranger.token);
    const absent = await request(`/api/boards/${nonexistent}`, 'GET', undefined, stranger.token);
    assert.equal(hidden.status, 404);
    assert.deepEqual(hidden, absent);
    assert.deepEqual(await request(`/api/boards/${boardId}`, 'PUT',
      { expectedVersion: 1, ...initial }, stranger.token), absent);
    assert.deepEqual(await request(`/api/boards/${boardId}`, 'DELETE', undefined, stranger.token), absent);

    await boardService.addMember(boardId, owner.user.id, editor.user.id, 'editor');
    await boardService.addMember(boardId, owner.user.id, viewer.user.id, 'viewer');
    await boardService.addMember(boardId, owner.user.id, fourth.user.id, 'viewer');
    await assert.rejects(boardService.addMember(boardId, owner.user.id, fifth.user.id, 'editor'),
      { status: 409 });
    const viewed = await request(`/api/boards/${boardId}`, 'GET', undefined, viewer.token);
    assert.equal(viewed.status, 200);
    assert.equal(viewed.body.board.members.length, 4);
    assert.equal(JSON.stringify(viewed.body).includes(owner.user.email), false);
    assert.equal(JSON.stringify(viewed.body).includes(editor.user.email), false);
    assert.equal((await request(`/api/boards/${boardId}`, 'PUT',
      { expectedVersion: 1, ...initial }, viewer.token)).status, 403);
    assert.equal((await request(`/api/boards/${boardId}`, 'DELETE', undefined, viewer.token)).status, 403);
    assert.equal((await request(`/api/boards/${boardId}`, 'DELETE', undefined, editor.token)).status, 403);

    const listed = await request('/api/boards', 'GET', undefined, viewer.token);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.boards.length, 1);
    assert.equal(Object.hasOwn(listed.body.boards[0], 'data'), false);
    assert.equal(JSON.stringify(listed.body).includes('data:image'), false);
    assert.equal(JSON.stringify(listed.body).includes('@example.com'), false);
    assert.deepEqual((await request('/api/boards', 'GET', undefined, stranger.token)).body.boards, []);

    const changed = await request(`/api/boards/${boardId}`, 'PUT',
      { expectedVersion: 1, title: '순천 여행 수정', data }, editor.token);
    assert.equal(changed.status, 200);
    assert.equal(changed.body.board.version, 2);
    assert.equal(changed.body.board.title, '순천 여행 수정');
    assert.equal((await request(`/api/boards/${boardId}`, 'PUT',
      { expectedVersion: 1, ...initial }, owner.token)).status, 409);
    assert.equal((await request(`/api/boards/${boardId}`, 'PUT',
      { expectedVersion: 2, title: '무효', data: { ...data, tripMeta: { region: '순천', partySize: 51 } } }, owner.token)).status, 400);
    assert.equal((await request(`/api/boards/${boardId}`, 'GET', undefined, owner.token)).body.board.version, 2);

    const oversized = await request('/api/boards', 'POST',
      { title: '너무 큰 사진', data: { ...data, cards: [{ ...data.cards[0], imageUrl: 'x'.repeat(9 * 1024 * 1024) }] } }, owner.token);
    assert.equal(oversized.status, 413);
    assert.match(oversized.body.error, /8MB/);

    assert.equal((await request(`/api/boards/${boardId}`, 'DELETE', undefined, owner.token)).status, 204);
    assert.deepEqual(await request(`/api/boards/${boardId}`, 'GET', undefined, owner.token), absent);
    assert.deepEqual(await request(`/api/boards/${boardId}`, 'GET', undefined, viewer.token), absent);
    assert.deepEqual((await request('/api/boards', 'GET', undefined, owner.token)).body.boards, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('동시 참여 요청에도 소유자 포함 네 명까지만 추가된다', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tteonayo-members-'));
  const dbPath = path.join(dir, 'db.json');
  process.env.TTEONAYO_DB_PATH = dbPath;
  process.env.DATABASE_URL = '';
  const storePath = require.resolve('../src/store');
  const dbModulePath = require.resolve('../src/db');
  const servicePath = require.resolve('../src/boardService');
  delete require.cache[storePath];
  delete require.cache[dbModulePath];
  delete require.cache[servicePath];
  const store = require('../src/store');
  const service = require('../src/boardService');
  try {
    const owner = await store.createUser({ email: 'race-owner@example.com', name: '소유자', passwordHash: 'test' });
    const candidates = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      store.createUser({ email: `race-${index}@example.com`, name: `회원${index}`, passwordHash: 'test' })));
    const board = await store.boards.create(owner.id, '경합 테스트', { schemaVersion: 1, cards: [], connections: [] });
    const results = await Promise.allSettled(candidates.map((user) =>
      service.addMember(board.id, owner.id, user.id, 'editor')));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);
    assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.status === 409).length, 3);
    assert.equal((await service.get(board.id, owner.id)).members.length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
