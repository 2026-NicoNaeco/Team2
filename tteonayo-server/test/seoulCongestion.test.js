const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getSeoulCongestion, parsePlace, PLACES } = require('../src/seoulCongestion');

test('서울시 XML에서 실제 혼잡도와 데이터 갱신 시각만 읽는다', () => {
  const xml = '<SeoulRtd.citydata><RESULT><RESULT.CODE>INFO-000</RESULT.CODE><RESULT.MESSAGE>정상 처리되었습니다.</RESULT.MESSAGE></RESULT><CITYDATA><AREA_NM>경복궁</AREA_NM><LIVE_PPLTN_STTS><AREA_CONGEST_LVL>약간 붐빔</AREA_CONGEST_LVL><PPLTN_TIME>2026-10-11 13:00</PPLTN_TIME></LIVE_PPLTN_STTS></CITYDATA></SeoulRtd.citydata>';
  assert.deepEqual(parsePlace(xml, '경복궁'), {
    name: '경복궁', level: '약간 붐빔', observedAt: '2026-10-11 13:00', source: '서울시 실시간 도시데이터',
  });
  assert.equal(parsePlace(xml, '북촌한옥마을'), null);
  assert.equal(parsePlace(xml.replace('INFO-000', 'ERROR-300'), '경복궁'), null);
  assert.equal(parsePlace(xml.replace('<PPLTN_TIME>2026-10-11 13:00</PPLTN_TIME>', ''), '경복궁'), null);
});

test('완성된 샘플 주소에서도 실제 인증키와 선택 장소로 한 곳만 조회한다', async () => {
  const oldKey = process.env.SEOUL_CITYDATA_API_KEY;
  const oldUrl = process.env.SEOUL_CITYDATA_API_URL;
  const originalFetch = global.fetch;
  const urls = [];
  process.env.SEOUL_CITYDATA_API_KEY = 'local-test-key';
  process.env.SEOUL_CITYDATA_API_URL = 'http://openapi.seoul.go.kr:8088/sample/xml/citydata/1/5/광화문·덕수궁';
  global.fetch = async (url) => {
    urls.push(decodeURIComponent(url.pathname));
    const name = decodeURIComponent(url.pathname.split('/').at(-1));
    if (name !== PLACES[0]) return new Response('', { status: 503 });
    return new Response(`<SeoulRtd.citydata><RESULT><RESULT.CODE>INFO-000</RESULT.CODE></RESULT><AREA_NM>${name}</AREA_NM><AREA_CONGEST_LVL>보통</AREA_CONGEST_LVL><PPLTN_TIME>2026-10-11 13:00</PPLTN_TIME></SeoulRtd.citydata>`);
  };
  try {
    const result = await getSeoulCongestion(PLACES[0]);
    assert.equal(result.status, 'ok');
    assert.equal(result.places.length, 1);
    assert.equal(urls.length, 1);
    assert.ok(urls.every((url) => url.includes('/local-test-key/xml/citydata/1/5/')));
    assert.ok(urls[0].endsWith('/경복궁'));
  } finally {
    global.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.SEOUL_CITYDATA_API_KEY;
    else process.env.SEOUL_CITYDATA_API_KEY = oldKey;
    if (oldUrl === undefined) delete process.env.SEOUL_CITYDATA_API_URL;
    else process.env.SEOUL_CITYDATA_API_URL = oldUrl;
  }
});
