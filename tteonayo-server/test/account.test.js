const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, readFileSync, unlinkSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('내 닉네임·비밀번호 변경은 본인에게만 적용되고 이전 토큰을 무효화한다', async () => {
  const testDir = mkdtempSync(path.join(tmpdir(), 'tteonayo-account-test-'));
  const dbPath = path.join(testDir, 'travel.json');
  process.env.TTEONAYO_DB_PATH = dbPath;
  process.env.JWT_SECRET = 'test-secret-only-for-account-api';
  process.env.DATABASE_URL = '';
  const app = require('../src/index');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, method = 'GET', body, token) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const first = await request('/api/auth/signup', 'POST', {
      email: 'account-first@example.com', password: 'old-password', name: '첫 사용자',
    });
    const second = await request('/api/auth/signup', 'POST', {
      email: 'account-second@example.com', password: 'second-password', name: '다른 사용자',
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstToken = first.body.token;
    const secondToken = second.body.token;
    assert.equal((await request('/api/auth/me', 'PUT', { name: '새 이름' })).status, 401);
    assert.equal((await request('/api/auth/me', 'PUT', { name: '   ' }, firstToken)).status, 400);
    assert.equal((await request('/api/auth/me', 'PUT', { name: '가'.repeat(31) }, firstToken)).status, 400);
    const renamed = await request('/api/auth/me', 'PUT', { name: '  새 이름  ', userId: second.body.user.id }, firstToken);
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.user.name, '새 이름');
    assert.equal((await request('/api/auth/me', 'GET', undefined, firstToken)).body.user.name, '새 이름');
    assert.equal((await request('/api/auth/me', 'GET', undefined, secondToken)).body.user.name, '다른 사용자');

    assert.equal((await request('/api/auth/password', 'PUT', {
      currentPassword: 'wrong', newPassword: 'new-password',
    }, firstToken)).status, 403);
    assert.equal((await request('/api/auth/password', 'PUT', {
      currentPassword: 'old-password', newPassword: 'old-password',
    }, firstToken)).status, 409);
    assert.equal((await request('/api/auth/password', 'PUT', {
      currentPassword: 'old-password', newPassword: 'short',
    }, firstToken)).status, 400);
    const changed = await request('/api/auth/password', 'PUT', {
      currentPassword: 'old-password', newPassword: 'new-password', userId: second.body.user.id,
    }, firstToken);
    assert.equal(changed.status, 200);
    assert.ok(changed.body.token);
    assert.equal((await request('/api/auth/me', 'GET', undefined, firstToken)).status, 401);
    assert.equal((await request('/api/auth/me', 'GET', undefined, changed.body.token)).status, 200);
    assert.equal((await request('/api/auth/login', 'POST', {
      email: 'account-first@example.com', password: 'old-password',
    })).status, 401);
    assert.equal((await request('/api/auth/login', 'POST', {
      email: 'account-first@example.com', password: 'new-password',
    })).status, 200);
    assert.equal((await request('/api/auth/me', 'GET', undefined, secondToken)).status, 200);
    const stored = JSON.parse(readFileSync(dbPath, 'utf8'));
    assert.equal(stored.users[0].name, '새 이름');
    assert.equal(stored.users[0].tokenVersion, 1);
    assert.ok(!readFileSync(dbPath, 'utf8').includes('new-password'));

    assert.equal((await request('/api/auth/find-email', 'POST', {
      name: '새 이름', password: 'wrong',
    })).status, 404);
    const found = await request('/api/auth/find-email', 'POST', {
      name: '새 이름', password: 'new-password',
    });
    assert.equal(found.body.email, 'account-first@example.com');
    assert.equal((await request('/api/auth/password-reset/request', 'POST', {
      email: 'account-first@example.com',
    })).status, 503);

    process.env.RESEND_API_KEY = 'test-mail-key';
    process.env.RESEND_FROM_EMAIL = 'test@example.com';
    process.env.APP_PUBLIC_URL = 'http://localhost:5173';
    const originalFetch = global.fetch;
    let resetLink;
    let sentCount = 0;
    global.fetch = (url, options) => {
      if (url === 'https://api.resend.com/emails') {
        sentCount += 1;
        const mail = JSON.parse(options.body);
        resetLink = mail.text.match(/http:\/\/localhost:5173\/reset-password#[^\s]+/)[0];
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return originalFetch(url, options);
    };
    try {
      const unknown = await request('/api/auth/password-reset/request', 'POST', { email: 'missing@example.com' });
      const known = await request('/api/auth/password-reset/request', 'POST', { email: 'account-first@example.com' });
      assert.equal(unknown.status, 200);
      assert.equal(known.status, 200);
      assert.deepEqual(unknown.body, known.body);
      assert.deepEqual((await request('/api/auth/password-reset/request', 'POST', {
        email: 'account-first@example.com',
      })).body, known.body);
      assert.equal(sentCount, 1);
      const token = new URLSearchParams(new URL(resetLink).hash.slice(1)).get('token');
      assert.equal((await request('/api/auth/me', 'GET', undefined, token)).status, 401);
      assert.equal((await request('/api/auth/password-reset/confirm', 'POST', {
        token, newPassword: 'reset-password',
      })).status, 200);
      assert.equal((await request('/api/auth/password-reset/confirm', 'POST', {
        token, newPassword: 'reset-again',
      })).status, 400);
      assert.equal((await request('/api/auth/login', 'POST', {
        email: 'account-first@example.com', password: 'reset-password',
      })).status, 200);
    } finally {
      global.fetch = originalFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;
      delete process.env.APP_PUBLIC_URL;
    }

    const owned = await request('/api/boards', 'POST', {
      title: '탈퇴 계정의 일정판', data: { schemaVersion: 1, cards: [], connections: [] },
    }, secondToken);
    assert.equal(owned.status, 201);
    const firstLogin = await request('/api/auth/login', 'POST', {
      email: 'account-first@example.com', password: 'reset-password',
    });
    assert.equal((await request(`/api/boards/${owned.body.board.id}/members`, 'POST', {
      email: 'account-first@example.com',
    }, secondToken)).status, 201);

    assert.equal((await request('/api/auth/me', 'DELETE', { password: 'wrong' }, secondToken)).status, 403);
    assert.equal((await request('/api/auth/me', 'DELETE', { password: 'second-password' }, secondToken)).status, 200);
    assert.equal((await request('/api/auth/me', 'GET', undefined, secondToken)).status, 401);
    assert.equal((await request('/api/auth/login', 'POST', {
      email: 'account-second@example.com', password: 'second-password',
    })).status, 401);
    assert.equal((await request('/api/auth/login', 'POST', {
      email: 'account-first@example.com', password: 'reset-password',
    })).status, 200);
    assert.equal((await request('/api/boards', 'GET', undefined, firstLogin.body.token)).body.boards.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    unlinkSync(dbPath);
    rmdirSync(testDir);
  }
});
