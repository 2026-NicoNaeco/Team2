const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('이메일로 편집자를 추가하고 소유자가 멤버를 관리한다', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tteonayo-board-members-'));
  process.env.TTEONAYO_DB_PATH = path.join(dir, 'db.json');
  process.env.JWT_SECRET = 'test-secret-only-for-members';
  process.env.DATABASE_URL = '';
  const app = require('../src/index');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, method = 'GET', body, token) => {
    const response = await fetch(base + route, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const users = await Promise.all([1, 2, 3, 4, 5].map(async (index) => {
      const result = await request('/api/auth/signup', 'POST', {
        email: `member-${index}-${Date.now()}@example.com`, password: 'password1', name: `회원${index}`,
      });
      assert.equal(result.status, 201);
      return result.body;
    }));
    const [owner, editor, third, fourth, fifth] = users;
    const board = await request('/api/boards', 'POST',
      { title: '함께 쓰는 일정', data: { schemaVersion: 1, cards: [], connections: [] } }, owner.token);
    assert.equal(board.status, 201);
    const route = `/api/boards/${board.body.board.id}/members`;

    await t.test('소유자만 추가와 제거가 가능하다', async () => {
      assert.equal((await request(route, 'POST', { email: editor.user.email })).status, 401);
      assert.equal((await request(route, 'POST', { email: editor.user.email }, third.token)).status, 404);
      assert.equal((await request(route, 'POST', { email: editor.user.email }, owner.token)).status, 201);
      assert.equal((await request(route, 'POST', { email: third.user.email }, editor.token)).status, 403);
      assert.equal((await request(`${route}/${owner.user.id}`, 'DELETE', undefined, owner.token)).status, 403);
      assert.equal((await request(`${route}/${editor.user.id}`, 'DELETE', undefined, editor.token)).status, 403);
    });

    await t.test('소유자 포함 네 명이 차면 다섯 번째 참여자를 거절한다', async () => {
      assert.equal((await request(route, 'POST', { email: third.user.email }, owner.token)).status, 201);
      assert.equal((await request(route, 'POST', { email: fourth.user.email }, owner.token)).status, 201);
      const full = await request(route, 'POST', { email: fifth.user.email }, owner.token);
      const duplicate = await request(route, 'POST', { email: editor.user.email }, owner.token);
      const missing = await request(route, 'POST', { email: 'absent@example.com' }, owner.token);
      assert.equal(full.status, 409);
      assert.deepEqual(full.body, duplicate.body);
      assert.deepEqual(full.body, missing.body);
      assert.equal(full.body.error, '추가할 수 없어요.');
      assert.equal((await request('/api/boards', 'GET', undefined, fifth.token)).body.boards.length, 0);
    });

    await t.test('응답에 이메일이 없고 제거하면 즉시 접근이 끊긴다', async () => {
      const ownerView = await request(`/api/boards/${board.body.board.id}`, 'GET', undefined, owner.token);
      const editorList = await request('/api/boards', 'GET', undefined, editor.token);
      assert.equal(editorList.body.boards.length, 1);
      assert.equal(ownerView.body.board.members.length, 4);
      assert.equal(JSON.stringify(ownerView.body).includes('@example.com'), false);
      assert.equal(JSON.stringify(editorList.body).includes('@example.com'), false);
      assert.equal((await request(`${route}/${editor.user.id}`, 'DELETE', undefined, owner.token)).status, 204);
      assert.equal((await request(`/api/boards/${board.body.board.id}`, 'GET', undefined, editor.token)).status, 404);
      assert.equal((await request('/api/boards', 'GET', undefined, editor.token)).body.boards.length, 0);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
