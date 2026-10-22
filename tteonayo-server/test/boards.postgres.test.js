const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');

const adminConnection = process.env.TEST_POSTGRES_ADMIN_URL;

test('로컬 임시 PostgreSQL: 스키마·트랜잭션·권한·경합·JSON 왕복',
  { skip: adminConnection ? false : 'TEST_POSTGRES_ADMIN_URL이 없어 PostgreSQL 통합 테스트를 건너뜁니다.' },
  async () => {
    const adminUrl = new URL(adminConnection);
    if (!['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname) ||
        !['/postgres', '/template1'].includes(adminUrl.pathname)) {
      throw new Error('테스트 관리자 주소는 로컬 PostgreSQL의 postgres 또는 template1 DB여야 합니다.');
    }
    const databaseName = `tteonayo_test_${randomBytes(8).toString('hex')}`;
    const admin = new Pool({ connectionString: adminUrl.toString(), max: 2 });
    const testUrl = new URL(adminUrl);
    testUrl.pathname = `/${databaseName}`;
    const originalUrl = process.env.DATABASE_URL;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;
    let store;
    let server;
    let created = false;
    try {
      await admin.query(`CREATE DATABASE ${databaseName}`);
      created = true;
      process.env.DATABASE_URL = testUrl.toString();
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'test-secret-only-for-local-postgres-board-api';
      const storePath = require.resolve('../src/store');
      delete require.cache[storePath];
      store = require('../src/store');

      // A clean database must initialize without errors.
      await store.ensureReady();
      const pool = new Pool({ connectionString: testUrl.toString(), max: 3 });
      try {
        const tables = await pool.query(`SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'tteonayo' AND table_name IN ('users', 'travel_states', 'boards', 'board_members')`);
        assert.deepEqual(new Set(tables.rows.map((row) => row.table_name)),
          new Set(['users', 'travel_states', 'boards', 'board_members']));

        // Simulate an older installation containing only users and travel_states.
        await pool.query('DROP TABLE tteonayo.board_members');
        await pool.query('DROP TABLE tteonayo.boards');
        const owner = (await pool.query(`INSERT INTO tteonayo.users (email, name, password_hash)
          VALUES ('pg-owner@example.com', '소유자', 'test') RETURNING id`)).rows[0].id;
        const legacyData = { savedBoards: [{ id: 'legacy-1', title: '기존 일정', cards: [], connections: [] }] };
        await pool.query(`INSERT INTO tteonayo.travel_states (owner_id, version, data)
          VALUES ($1, 1, $2::jsonb)`, [owner, JSON.stringify(legacyData)]);
        await store.close();
        delete require.cache[storePath];
        store = require('../src/store');
        await store.ensureReady();
        await store.ensureReady();
        const legacy = await pool.query('SELECT version, data FROM tteonayo.travel_states WHERE owner_id = $1', [owner]);
        assert.equal(legacy.rows[0].version, 1);
        assert.deepEqual(legacy.rows[0].data, legacyData);

        const boardServicePath = require.resolve('../src/boardService');
        const boardRoutesPath = require.resolve('../src/boardRoutes');
        const authPath = require.resolve('../src/auth');
        const indexPath = require.resolve('../src/index');
        for (const file of [boardServicePath, boardRoutesPath, authPath, indexPath]) delete require.cache[file];
        const service = require('../src/boardService');
        const { signToken } = require('../src/auth');
        const app = require('../src/index');
        const participants = [];
        for (let index = 0; index < 12; index += 1) {
          const user = await pool.query(`INSERT INTO tteonayo.users (email, name, password_hash)
            VALUES ($1, $2, 'test') RETURNING id`, [`pg-${index}@example.com`, `회원${index}`]);
          participants.push(user.rows[0].id);
        }
        const data = { schemaVersion: 1,
          cards: [{ id: 'card-1', day: '1일차', title: '경복궁', description: '사진 보존', top: 12, left: 34,
            imageUrl: 'data:image/png;base64,AAECA/8=' },
          { id: 'card-2', day: '1일차', title: '카페', description: '', top: 56, left: 78 }],
          connections: [{ id: 'line-1', from: 'card-1', to: 'card-2', label: '도보 30분', durationMinutes: 30 }],
          tripMeta: { region: '서울', partySize: 2 }, tripPlaces: [] };

        // An owner-member insertion failure must roll back the board insertion.
        await pool.query(`CREATE FUNCTION tteonayo.reject_owner_for_test() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN IF NEW.role = 'owner' THEN
          RAISE EXCEPTION 'forced owner insert failure'; END IF; RETURN NEW; END; $$`);
        await pool.query(`CREATE TRIGGER reject_owner_for_test BEFORE INSERT ON tteonayo.board_members
          FOR EACH ROW EXECUTE FUNCTION tteonayo.reject_owner_for_test()`);
        await assert.rejects(store.boards.create(owner, '실패해야 하는 보드', data), /forced owner insert failure/);
        assert.equal((await pool.query('SELECT count(*)::integer AS total FROM tteonayo.boards')).rows[0].total, 0);
        await pool.query('DROP TRIGGER reject_owner_for_test ON tteonayo.board_members');
        await pool.query('DROP FUNCTION tteonayo.reject_owner_for_test()');

        const board = await service.create(owner, { title: '서울 여행', data });
        assert.equal(board.role, 'owner');
        assert.deepEqual((await service.get(board.id, owner)).data, data);
        assert.deepEqual((await pool.query('SELECT data FROM tteonayo.boards WHERE id = $1', [board.id])).rows[0].data, data);
        assert.equal((await pool.query(`SELECT count(*)::integer AS total FROM tteonayo.board_members
          WHERE board_id = $1 AND role = 'owner'`, [board.id])).rows[0].total, 1);
        await assert.rejects(pool.query(`INSERT INTO tteonayo.board_members (board_id, user_id, role)
          VALUES ($1, $2, 'owner')`, [board.id, participants[0]]), { code: '23505' });

        await service.addMember(board.id, owner, participants[0], 'editor');
        await service.addMember(board.id, owner, participants[1], 'viewer');
        await assert.rejects(service.addMember(board.id, owner, participants[0], 'editor'), { status: 409 });
        await assert.rejects(service.addMember(board.id, owner, 999999999, 'viewer'), { status: 404 });
        const raced = await Promise.allSettled(participants.slice(2).map((id) =>
          service.addMember(board.id, owner, id, 'viewer')));
        assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(raced.filter((result) => result.status === 'rejected' && result.reason.status === 409).length, 9);
        assert.equal((await service.get(board.id, owner)).members.length, 4);

        server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}`;
        const ownerToken = signToken(await store.getUserById(owner));
        const viewerToken = signToken(await store.getUserById(participants[1]));
        const strangerToken = signToken(await store.getUserById(participants[11]));
        async function request(route, method = 'GET', body, token) {
          const response = await fetch(base + route, { method,
            headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined });
          return { status: response.status, body: response.status === 204 ? null : await response.json() };
        }
        assert.equal((await request('/api/boards')).status, 401);
        const missingId = '00000000-0000-4000-8000-000000000000';
        const hidden = await request(`/api/boards/${board.id}`, 'GET', undefined, strangerToken);
        assert.deepEqual(hidden, await request(`/api/boards/${missingId}`, 'GET', undefined, strangerToken));
        assert.equal(hidden.status, 404);
        assert.equal((await request(`/api/boards/${board.id}`, 'PUT',
          { expectedVersion: 1, title: '수정', data }, viewerToken)).status, 403);
        assert.equal((await request(`/api/boards/${board.id}`, 'DELETE', undefined, viewerToken)).status, 403);
        const listing = await request('/api/boards', 'GET', undefined, ownerToken);
        assert.equal(listing.body.boards.length, 1);
        assert.equal(Object.hasOwn(listing.body.boards[0], 'data'), false);
        assert.equal(JSON.stringify(listing.body).includes('data:image'), false);
        const detail = await request(`/api/boards/${board.id}`, 'GET', undefined, viewerToken);
        assert.equal(JSON.stringify(detail.body).includes('@example.com'), false);
        assert.deepEqual(detail.body.board.data, data);
        assert.equal((await request(`/api/boards/${board.id}`, 'PUT',
          { expectedVersion: 1, title: '수정', data }, ownerToken)).status, 200);
        assert.equal((await request(`/api/boards/${board.id}`, 'PUT',
          { expectedVersion: 1, title: '오래된 수정', data }, ownerToken)).status, 409);
        assert.equal((await request(`/api/boards/${board.id}`, 'DELETE', undefined, ownerToken)).status, 204);
        assert.deepEqual(await request(`/api/boards/${board.id}`, 'GET', undefined, ownerToken),
          await request(`/api/boards/${missingId}`, 'GET', undefined, ownerToken));
        assert.deepEqual((await request('/api/boards', 'GET', undefined, ownerToken)).body.boards, []);
        assert.deepEqual((await pool.query('SELECT data FROM tteonayo.travel_states WHERE owner_id = $1', [owner])).rows[0].data,
          legacyData);
      } finally {
        if (server) await new Promise((resolve) => server.close(resolve));
        await pool.end();
      }
    } finally {
      if (store) await store.close();
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalJwtSecret;
      if (created) await admin.query(`DROP DATABASE ${databaseName}`);
      await admin.end();
    }
  });
