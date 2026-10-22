const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, unlinkSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('여행 가이드 요청은 인증·입력을 확인하고 사용자 여행 정보만 전달한다', async () => {
  const testDir = mkdtempSync(path.join(tmpdir(), 'tteonayo-chat-test-'));
  const dbPath = path.join(testDir, 'travel.json');
  process.env.TTEONAYO_DB_PATH = dbPath;
  process.env.JWT_SECRET = 'test-secret-only-for-chat-api';
  process.env.DATABASE_URL = '';
  process.env.OPENAI_API_KEY = '';
  process.env.NAVER_SEARCH_CLIENT_ID = '';
  process.env.NAVER_SEARCH_CLIENT_SECRET = '';
  process.env.NAVER_API_HUB_CLIENT_ID = '';
  process.env.NAVER_API_HUB_CLIENT_SECRET = '';
  const app = require('../src/index');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = global.fetch;
  let upstreamRequest;
  global.fetch = async (url, options) => {
    if (url === 'https://api.openai.com/v1/responses') {
      upstreamRequest = JSON.parse(options.body);
      const lodging = upstreamRequest.input.at(-1).content.includes('호텔');
      const content = lodging
        ? { type: 'output_text', text: '검색으로 확인한 숙소 후보예요.', annotations: [
          { type: 'url_citation', title: '숙소 공식 사이트', url: 'https://example.com/stay' },
          { type: 'url_citation', title: '허용되지 않는 링크', url: 'javascript:alert(1)' },
        ] }
        : { type: 'output_text', text: '순천 여행은 예약 시간을 먼저 확인해 보세요.' };
      return new Response(JSON.stringify({ output: [{ content: [content] }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).startsWith('https://openapi.naver.com/v1/search/local.json')) {
      assert.equal(options.headers['X-Naver-Client-Id'], 'test-local-id');
      assert.equal(options.headers['X-Naver-Client-Secret'], 'test-local-secret');
      return new Response(JSON.stringify({ items: [{
        title: '<b>순천만</b> 카페', category: '카페', roadAddress: '전남 순천시 테스트로 1',
        mapx: '1274980000', mapy: '349412000',
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).startsWith('https://naverapihub.apigw.ntruss.com/search/v1/local')) {
      assert.equal(options.headers['X-NCP-APIGW-API-KEY-ID'], 'test-hub-id');
      assert.equal(options.headers['X-NCP-APIGW-API-KEY'], 'test-hub-secret');
      if (String(url).includes('error-test')) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ items: [{
        title: '<b>순천만</b> 카페', category: '카페', roadAddress: '전남 순천시 테스트로 1',
        mapx: '127.498', mapy: '34.9412',
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };
  const request = async (route, method = 'GET', body, token) => {
    const response = await originalFetch(`${base}${route}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const suffix = Date.now();
    const userA = await request('/api/auth/signup', 'POST', { email: `guide-a-${suffix}@example.com`, password: 'password1', name: 'A' });
    const userB = await request('/api/auth/signup', 'POST', { email: `guide-b-${suffix}@example.com`, password: 'password1', name: 'B' });
    const payload = { region: '순천', messages: [{ sender: 'user', text: '예약 순서를 알려줘' }] };
    assert.equal((await request('/api/chat/reply', 'POST', payload)).status, 401);
    assert.equal((await request('/api/chat/reply', 'POST', { ...payload, messages: [{ sender: 'user', text: '' }] }, userA.body.token)).status, 400);
    assert.equal((await request('/api/chat/reply', 'POST', payload, userA.body.token)).status, 503);

    const stateA = { places: [{ id: 'place-1', name: '순천만', category: '관광지', description: '', tags: [], lat: 34.9412, lng: 127.498 }],
      savedIds: ['place-1'], activeTripMeta: { region: '순천', partySize: 2, totalBudget: 100000 },
      activeTripPlaces: [{ id: 'trip-1', placeId: 'place-1', status: 'scheduled', snapshot: { name: '순천만' }, visitDate: '2026-10-20', visitOrder: 1, reservationTime: '10:00' }] };
    const stateB = { activeTripMeta: { region: '순천', partySize: 5, totalBudget: 900000 }, activeTripPlaces: [] };
    assert.equal((await request('/api/travel/state', 'PUT', { version: 0, data: stateA }, userA.body.token)).status, 200);
    assert.equal((await request('/api/travel/state', 'PUT', { version: 0, data: stateB }, userB.body.token)).status, 200);
    process.env.OPENAI_API_KEY = 'test-key';
    const reply = await request('/api/chat/reply', 'POST', payload, userA.body.token);
    assert.equal(reply.status, 200);
    assert.equal(reply.body.answer, '순천 여행은 예약 시간을 먼저 확인해 보세요.');
    assert.match(upstreamRequest.instructions, /이모지/);
    assert.equal(upstreamRequest.store, false);
    const context = JSON.parse(upstreamRequest.input[0].content.split('\n')[1]);
    assert.equal(context.trip.partySize, 2);
    assert.equal(context.trip.places[0].reservationTime, '10:00');
    assert.equal(context.savedPlaces[0].name, '순천만');
    assert.equal(upstreamRequest.input.at(-1).content, '예약 순서를 알려줘');
    assert.equal(upstreamRequest.tools, undefined);
    const boardData = (name) => ({ schemaVersion: 1, cards: [], connections: [],
      tripMeta: { region: '제주', partySize: 2 },
      tripPlaces: [{ id: 'trip-place-1', placeId: 'place-1', status: 'scheduled',
        snapshot: { name }, visitDate: '2026-10-21', visitOrder: 1, note: '연락처 private@example.com 010-1234-5678' }] });
    assert.equal((await request('/api/boards', 'POST', {
      title: '다른 사용자의 제주 일정', data: boardData('다른 사람만 아는 장소'),
    }, userB.body.token)).status, 201);
    assert.equal((await request('/api/boards', 'POST', {
      title: '내 제주 일정', data: boardData('내가 저장한 장소'),
    }, userA.body.token)).status, 201);
    const jejuReply = await request('/api/chat/reply', 'POST',
      { region: '제주', messages: [{ sender: 'user', text: '내 제주 일정 정리해줘' }] }, userA.body.token);
    assert.equal(jejuReply.status, 200);
    const jejuContext = JSON.parse(upstreamRequest.input[0].content.split('\n')[1]);
    assert.equal(jejuContext.trip.places[0].name, '내가 저장한 장소');
    assert.equal(JSON.stringify(upstreamRequest).includes('다른 사람만 아는 장소'), false);
    assert.equal(JSON.stringify(upstreamRequest).includes(userA.body.user.email), false);
    assert.equal(JSON.stringify(upstreamRequest).includes(userB.body.user.email), false);
    assert.equal(JSON.stringify(upstreamRequest).includes('private@example.com'), false);
    assert.equal(JSON.stringify(upstreamRequest).includes('010-1234-5678'), false);

    const lodgingReply = await request('/api/chat/reply', 'POST', {
      region: '순천', messages: [{ sender: 'user', text: '순천만 근처 호텔 추천해줘' }],
    }, userA.body.token);
    assert.equal(lodgingReply.status, 200);
    assert.equal(upstreamRequest.tools[0].type, 'web_search');
    assert.equal(upstreamRequest.tool_choice, 'required');
    assert.deepEqual(lodgingReply.body.sources, [{ title: '숙소 공식 사이트', url: 'https://example.com/stay' }]);

    assert.equal((await request('/api/places/search?query=순천만')).status, 401);
    assert.equal((await request('/api/places/search?query=x', 'GET', undefined, userA.body.token)).status, 400);
    assert.equal((await request('/api/places/search?query=순천만', 'GET', undefined, userA.body.token)).status, 503);
    process.env.NAVER_SEARCH_CLIENT_ID = 'test-local-id';
    process.env.NAVER_SEARCH_CLIENT_SECRET = 'test-local-secret';
    const places = await request('/api/places/search?query=순천만', 'GET', undefined, userA.body.token);
    assert.equal(places.status, 200);
    assert.equal(places.body.places[0].name, '순천만 카페');
    assert.equal(places.body.places[0].lat, 34.9412);
    assert.equal(places.body.places[0].source, 'naver');
    assert.equal(places.body.places[0].categoryLabel, '카페');
    process.env.NAVER_API_HUB_CLIENT_ID = 'test-hub-id';
    process.env.NAVER_API_HUB_CLIENT_SECRET = 'test-hub-secret';
    const hubPlaces = await request('/api/places/search?query=순천만', 'GET', undefined, userA.body.token);
    assert.equal(hubPlaces.status, 200);
    assert.equal(hubPlaces.body.places[0].lng, 127.498);
    const hubError = await request('/api/places/search?query=error-test', 'GET', undefined, userA.body.token);
    assert.equal(hubError.status, 502);
    assert.match(hubError.body.error, /인증·권한/);
  } finally {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    delete process.env.NAVER_SEARCH_CLIENT_ID;
    delete process.env.NAVER_SEARCH_CLIENT_SECRET;
    delete process.env.NAVER_API_HUB_CLIENT_ID;
    delete process.env.NAVER_API_HUB_CLIENT_SECRET;
    await new Promise((resolve) => server.close(resolve));
    unlinkSync(dbPath);
    rmdirSync(testDir);
  }
});
