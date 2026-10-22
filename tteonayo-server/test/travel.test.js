const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, unlinkSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('여행 데이터 가져오기·소유권·버전 충돌·검증', async () => {
  const testDir = mkdtempSync(path.join(tmpdir(), 'tteonayo-travel-test-'));
  const dbPath = path.join(testDir, 'travel.json');
  process.env.TTEONAYO_DB_PATH = dbPath;
  process.env.JWT_SECRET = 'test-secret-only-for-local-travel-api';
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
    const suffix = Date.now();
    const userA = await request('/api/auth/signup', 'POST', { email: `a-${suffix}@example.com`, password: 'password1', name: 'A' });
    const userB = await request('/api/auth/signup', 'POST', { email: `b-${suffix}@example.com`, password: 'password1', name: 'B' });
    assert.equal(userA.status, 201);
    assert.equal(userB.status, 201);
    const tokenA = userA.body.token;
    const tokenB = userB.body.token;
    assert.equal((await request('/api/travel/state')).status, 401);

    const now = new Date().toISOString();
    const data = { savedBoards: [{ id: 'board-1', title: '순천 여행',
      cards: [{ id: 'card-1', day: '저장한 장소', title: '순천만', description: '', top: 40, left: 40, placeId: 'place-1' },
        { id: 'card-2', day: '메모', title: '준비물', description: '', top: 80, left: 280 },
        { id: 'card-3', kind: 'text', day: '텍스트', title: '텍스트', description: '집합 장소 확인', top: 120, left: 520,
          textWidth: 360, textFontSize: 32, textBold: true, textAlign: 'center' }],
      connections: [{ id: 'route-1', from: 'card-1', to: 'card-2', transportMode: 'walk', durationMinutes: 30, description: '직접 입력', durationSource: 'manual' }], createdAt: now, updatedAt: now,
      tripMeta: { region: '순천', startDate: '2026-10-20', endDate: '2026-10-22', partySize: 2, totalBudget: 100000 },
      tripPlaces: [{ id: 'trip-place-1', placeId: 'place-1', snapshot: { name: '순천만', lat: 34.88, lng: 127.51 },
        status: 'scheduled', visitDate: '2026-10-20', visitOrder: 1, cost: 20000, costBasis: 'per_person' }] }], savedIds: [] };
    const imported = await request('/api/travel/import', 'POST', { importId: 'browser-a', data }, tokenA);
    assert.equal(imported.status, 201);
    assert.equal(imported.body.version, 1);
    const repeated = await request('/api/travel/import', 'POST', { importId: 'browser-a', data }, tokenA);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.version, 1);
    const competingImport = await request('/api/travel/import', 'POST',
      { importId: 'browser-a-second', data: { ...data, savedIds: ['other-place'] } }, tokenA);
    assert.equal(competingImport.status, 409);
    assert.equal((await request('/api/travel/state', 'GET', undefined, tokenB)).body.data, null);

    const spoofedOwner = await request('/api/travel/state', 'PUT',
      { version: 0, ownerId: userA.body.user.id, data: { savedIds: ['b-place'] } }, tokenB);
    assert.equal(spoofedOwner.status, 200);
    assert.deepEqual((await request('/api/travel/state', 'GET', undefined, tokenB)).body.data.savedIds, ['b-place']);
    assert.equal((await request('/api/travel/state', 'GET', undefined, tokenA)).body.data.savedIds.length, 0);

    const changed = { ...data, savedIds: ['other-place'] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 0, data: changed }, tokenA)).status, 409);
    const saved = await request('/api/travel/state', 'PUT', { version: 1, data: changed }, tokenA);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.version, 2);
    assert.equal((await request('/api/travel/state', 'GET', undefined, tokenA)).body.data.savedBoards[0].title, '순천 여행');
    assert.equal((await request('/api/travel/state', 'PUT', { version: 2, data: {
      ...changed, savedBoards: [{ ...data.savedBoards[0], title: '허용되지 않는 변경' }],
    } }, tokenA)).status, 409);
    assert.equal((await request('/api/travel/state', 'GET', undefined, tokenA)).body.data.savedBoards[0].connections[0].durationMinutes, 30);
    assert.equal((await request('/api/travel/state', 'GET', undefined, tokenA)).body.data.savedBoards[0].cards[2].description, '집합 장소 확인');
    assert.equal((await request('/api/travel/state', 'GET', undefined, tokenA)).body.data.savedBoards[0].cards[2].textWidth, 360);
    assert.deepEqual((await request('/api/travel/state', 'GET', undefined, tokenB)).body.data.savedIds, ['b-place']);
    const invalid = { ...changed, savedBoards: [{ ...changed.savedBoards[0], tripMeta: { region: '순천', partySize: 0 } }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 2, data: invalid }, tokenA)).status, 400);
    const tooManyTravelers = { ...changed, savedBoards: [{ ...changed.savedBoards[0], tripMeta: { region: '순천', partySize: 51 } }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 2, data: tooManyTravelers }, tokenA)).status, 400);
    const invalidSchedule = { ...changed, savedBoards: [{ ...changed.savedBoards[0], tripPlaces: [{ ...data.savedBoards[0].tripPlaces[0], visitDate: undefined }] }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 2, data: invalidSchedule }, tokenA)).status, 400);
    const outsideTrip = { ...changed, savedBoards: [{ ...changed.savedBoards[0], tripPlaces: [{ ...data.savedBoards[0].tripPlaces[0], visitDate: '2026-10-23' }] }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 2, data: outsideTrip }, tokenA)).status, 400);
    const invalidDuration = { ...changed, savedBoards: [{ ...changed.savedBoards[0], connections: [{ ...changed.savedBoards[0].connections[0], durationMinutes: -1 }] }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 2, data: invalidDuration }, tokenA)).status, 400);
    const fiftyTravelers = { ...changed, savedBoards: [{ ...changed.savedBoards[0], tripMeta: { ...data.savedBoards[0].tripMeta, partySize: 50 },
      tripPlaces: [{ ...data.savedBoards[0].tripPlaces[0], visitTime: '10:00', reservationTime: '10:30', timeMeaning: 'separate' }] }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 2, data: fiftyTravelers }, tokenA)).status, 409);
    const savedTimes = (await request('/api/travel/state', 'GET', undefined, tokenA)).body.data.savedBoards[0].tripPlaces[0];
    assert.equal(savedTimes.visitTime, undefined);
    assert.equal(savedTimes.reservationTime, undefined);
    const invalidTime = { ...fiftyTravelers, savedBoards: [{ ...fiftyTravelers.savedBoards[0],
      tripPlaces: [{ ...fiftyTravelers.savedBoards[0].tripPlaces[0], visitTime: '25:00' }] }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 3, data: invalidTime }, tokenA)).status, 400);
    const invalidTextWidth = { ...fiftyTravelers, savedBoards: [{ ...fiftyTravelers.savedBoards[0], cards: [
      ...data.savedBoards[0].cards.slice(0, 2), { ...data.savedBoards[0].cards[2], textWidth: 801 }] }] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 3, data: invalidTextWidth }, tokenA)).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    unlinkSync(dbPath);
    rmdirSync(testDir);
  }
});
