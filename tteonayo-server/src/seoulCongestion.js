const PLACES = [
  '경복궁', '광화문·덕수궁', '북촌한옥마을', '인사동', '명동 관광특구',
  '홍대 관광특구', 'DDP(동대문디자인플라자)', '서울숲공원',
  '여의도한강공원', '잠실롯데타워·석촌호수',
];

const DEFAULT_URL = 'http://openapi.seoul.go.kr:8088/{key}/xml/citydata/1/5/{place}';
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
const pending = new Map();

function decodeXml(value) {
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function field(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function parsePlace(xml, requestedName) {
  const result = resultCode(xml);
  if (result && result !== 'INFO-000') return null;
  const name = field(xml, 'AREA_NM');
  const level = field(xml, 'AREA_CONGEST_LVL');
  const observedAt = field(xml, 'PPLTN_TIME');
  if (name !== requestedName || !['여유', '보통', '약간 붐빔', '붐빔', '매우 붐빔'].includes(level) || !observedAt) return null;
  return { name, level, observedAt, source: '서울시 실시간 도시데이터' };
}

function resultCode(xml) {
  const result = xml.match(/<RESULT>([\s\S]*?)<\/RESULT>/i)?.[1];
  return result ? (field(result, 'RESULT.CODE') || field(result, 'CODE') || result.trim()) : '';
}

function requestUrl(template, key, place) {
  try {
    const url = new URL(template.replace('{key}', 'placeholder').replace('{place}', 'placeholder'));
    const parts = url.pathname.split('/').filter(Boolean);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'openapi.seoul.go.kr' ||
        parts.length !== 6 || parts[1] !== 'xml' || parts[2] !== 'citydata' ||
        parts[3] !== '1' || parts[4] !== '5') return null;
    // 테스트 화면에서 복사한 완성된 주소여도 sample 키·장소를 실제 설정값으로 교체한다.
    url.pathname = `/${encodeURIComponent(key)}/xml/citydata/1/5/${encodeURIComponent(place)}`;
    url.search = '';
    return url;
  } catch {
    return null;
  }
}

async function fetchPlace(template, key, place) {
  const url = requestUrl(template, key, place);
  if (!url) throw new Error('서울시 API 주소 형식이 올바르지 않습니다.');
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return { status: 'unavailable', places: [] };
  const xml = await response.text();
  if (resultCode(xml) === 'INFO-100') return { status: 'invalid_key', places: [] };
  const parsed = parsePlace(xml, place);
  return parsed ? { status: 'ok', places: [parsed] } : { status: 'unavailable', places: [] };
}

async function getSeoulCongestion(place) {
  if (place && !PLACES.includes(place)) return { status: 'unsupported_place', places: [] };
  const key = process.env.SEOUL_CITYDATA_API_KEY?.trim();
  if (!key) return { status: 'unconfigured', places: [] };
  const template = process.env.SEOUL_CITYDATA_API_URL?.trim() || DEFAULT_URL;
  if (!requestUrl(template, key, PLACES[0])) return { status: 'invalid_config', places: [] };
  if (!place) return { status: 'ready', places: [] };
  const cacheKey = `${template}:${key}:${place}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  const promise = fetchPlace(template, key, place)
    .catch(() => ({ status: 'unavailable', places: [] }))
    .then((data) => {
      if (data.status === 'ok') cache.set(cacheKey, { at: Date.now(), data });
      return data;
    });
  pending.set(cacheKey, promise);
  try { return await promise; } finally { pending.delete(cacheKey); }
}

module.exports = { getSeoulCongestion, parsePlace, PLACES };
