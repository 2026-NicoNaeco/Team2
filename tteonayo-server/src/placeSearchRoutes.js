const express = require('express');
const store = require('./store');

const router = express.Router();

function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function categoryOf(value) {
  const category = plainText(value);
  if (/카페|커피|디저트|베이커리/.test(category)) return '카페';
  if (/숙박|호텔|모텔|펜션|리조트|게스트하우스/.test(category)) return '숙소';
  if (/음식점|식당|한식|중식|일식|양식|분식|술집/.test(category)) return '맛집';
  return '관광지';
}

function toPlace(item) {
  const name = plainText(item.title).slice(0, 80);
  // 지역 검색 좌표는 발급 경로에 따라 소수점 표기 또는 1e7 배 정수로 올 수 있다.
  const coordinate = (value) => {
    const number = Number(value);
    return Math.abs(number) > 180 ? number / 10000000 : number;
  };
  const lat = coordinate(item.mapy);
  const lng = coordinate(item.mapx);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  // 화면 표시용 세부 분류(예: '음식점>국밥' → '국밥'). 저장 데이터의 category는 4가지로 유지한다.
  const categoryLabel = plainText(item.category).split('>').pop().trim().slice(0, 30) || undefined;
  return {
    source: 'naver', sourceId: `${item.mapx}:${item.mapy}:${name}`.slice(0, 128),
    name, category: categoryOf(item.category), categoryLabel, lat, lng,
    address: plainText(item.roadAddress || item.address).slice(0, 200) || undefined,
  };
}

router.get('/search', async (req, res) => {
  if (!await store.getUserById(req.user.id)) return res.status(401).json({ error: '사용자를 찾을 수 없어요.' });
  const query = req.query.query;
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80) {
    return res.status(400).json({ error: '장소 이름을 2~80자로 입력해 주세요.' });
  }
  const hubId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const hubSecret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();
  const developerId = process.env.NAVER_SEARCH_CLIENT_ID?.trim();
  const developerSecret = process.env.NAVER_SEARCH_CLIENT_SECRET?.trim();
  const useHub = Boolean(hubId && hubSecret);
  const clientId = useHub ? hubId : developerId;
  const clientSecret = useHub ? hubSecret : developerSecret;
  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: '네이버 지역 검색 키가 설정되지 않았어요.' });
  }

  try {
    const url = new URL(useHub
      ? 'https://naverapihub.apigw.ntruss.com/search/v1/local'
      : 'https://openapi.naver.com/v1/search/local.json');
    url.searchParams.set('query', query.trim());
    url.searchParams.set('display', '5');
    if (useHub) url.searchParams.set('format', 'json');
    const response = await fetch(url, {
      headers: useHub
        ? { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret }
        : { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403
        ? '네이버 지역 검색 인증·권한을 확인해 주세요. 발급한 앱에서 지역 검색 API가 선택됐는지 확인하세요.'
        : response.status === 429
          ? '네이버 지역 검색 호출 한도에 도달했어요. 이용량을 확인해 주세요.'
          : '네이버 장소 검색을 불러오지 못했어요.';
      return res.status(502).json({ error: reason });
    }
    const payload = await response.json();
    if (!Array.isArray(payload.items)) {
      return res.status(502).json({ error: '네이버 지역 검색 응답 형식을 확인하지 못했어요.' });
    }
    const places = payload.items.map(toPlace).filter(Boolean);
    return res.json({ places });
  } catch (error) {
    console.error('네이버 장소 검색 오류:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: '네이버 장소 검색에 연결하지 못했어요.' });
  }
});

module.exports = router;
