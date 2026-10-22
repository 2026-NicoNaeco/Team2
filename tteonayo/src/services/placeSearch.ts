import type { Place } from '../types';
import { API_BASE_URL } from './apiBase';

// 지도 공급자가 바뀌어도 화면과 저장 데이터는 이 형태만 사용한다.
export type PlaceCandidate = Pick<Place, 'name' | 'category' | 'lat' | 'lng' | 'address'> & {
  source: 'openstreetmap' | 'kakao' | 'naver';
  sourceId: string;
  // 네이버 검색의 세부 분류(예: 국밥, 경찰서). 화면 표시용이며 저장하지 않는다.
  categoryLabel?: string;
};

const byDistance = (lat: number, lng: number) => (a: PlaceCandidate, b: PlaceCandidate) =>
  (a.lat - lat) ** 2 + (a.lng - lng) ** 2 - (b.lat - lat) ** 2 - (b.lng - lng) ** 2;

// 과거 카카오 장소 데이터와의 호환을 위해 변환 함수를 유지한다. 현재 검색에는 사용하지 않는다.
export function fromKakaoPlace(document: {
  id: string; place_name: string; category_group_code: string;
  road_address_name: string; address_name: string; x: string; y: string;
}): PlaceCandidate {
  const category: Place['category'] = document.category_group_code === 'CE7' ? '카페'
    : document.category_group_code === 'FD6' ? '맛집'
    : document.category_group_code === 'AD5' ? '숙소' : '관광지';
  return {
    source: 'kakao', sourceId: document.id,
    name: document.place_name, category,
    address: document.road_address_name || document.address_name || undefined,
    lat: Number(document.y), lng: Number(document.x),
  };
}

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function categoryOf(tags: Record<string, string>): Place['category'] {
  if (tags.amenity === 'cafe') return '카페';
  if (['restaurant', 'fast_food', 'food_court'].includes(tags.amenity)) return '맛집';
  if (['hotel', 'guest_house', 'hostel', 'motel'].includes(tags.tourism)) return '숙소';
  return '관광지';
}

function addressOf(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  return [tags['addr:city'] || tags['addr:county'], tags['addr:suburb'], street].filter(Boolean).join(' ') || undefined;
}

function toCandidate(element: OsmElement): PlaceCandidate | null {
  const tags = element.tags ?? {};
  const name = tags['name:ko'] || tags.name;
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!name || lat === undefined || lng === undefined) return null;
  return {
    name,
    category: categoryOf(tags),
    lat,
    lng,
    address: addressOf(tags),
    source: 'openstreetmap',
    sourceId: `${element.type}/${element.id}`,
  };
}

// 공개 Overpass 서버 부하를 줄이기 위해 지도 중심 2.5km와 200개로 제한한다.
// 장소 검색 제공처를 바꿀 때는 이 함수의 반환 형태만 맞추면 된다.
async function runOverpass(query: string, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  for (const endpoint of ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter']) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST', body: new URLSearchParams({ data: query }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
      if (!response.ok) continue;
      const data = await response.json() as { elements?: OsmElement[] };
      if (Array.isArray(data.elements)) return data.elements.map(toCandidate).filter((place): place is PlaceCandidate => place !== null);
    } catch {
      if (signal?.aborted) throw new DOMException('요청이 취소되었습니다.', 'AbortError');
    }
  }
  throw new Error('주변 장소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

// 지도에 핀이 너무 많으면 읽기 어려워 가까운 30곳만 보여준다.
export async function searchNearbyPlaces(lat: number, lng: number, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  const around = `(around:2500,${lat.toFixed(5)},${lng.toFixed(5)})`;
  const query = `[out:json][timeout:20];(` +
    `nwr["amenity"~"^(cafe|restaurant|fast_food|food_court)$"]["name"]${around};` +
    `nwr["tourism"~"^(attraction|museum|viewpoint|hotel|guest_house|hostel|motel)$"]["name"]${around};` +
    `nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]${around};` +
    `);out center 200;`;
  return (await runOverpass(query, signal)).sort(byDistance(lat, lng)).slice(0, 30);
}

const naverCache = new Map<string, PlaceCandidate[] | null>();

// 서버의 네이버 지역 검색만 호출한다. 키가 없거나(503) 로그인 전이면 null을 돌려 OSM 결과와 섞지 않는다.
export async function searchNaverPlaces(keyword: string, signal?: AbortSignal): Promise<PlaceCandidate[] | null> {
  const query = keyword.trim();
  if (query.length < 2 || query.length > 80) return [];
  if (naverCache.has(query)) return naverCache.get(query) ?? null;
  const token = localStorage.getItem('token');
  if (!token) return null;
  const response = await fetch(`${API_BASE_URL}/api/places/search?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  if (response.status === 503) {
    naverCache.set(query, null);
    return null;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || '네이버 장소 검색에 실패했어요.');
  }
  const payload = await response.json() as { places?: PlaceCandidate[] };
  const places = Array.isArray(payload.places) ? payload.places : [];
  naverCache.set(query, places);
  return places;
}

export async function searchPlacesByName(name: string, lat: number, lng: number, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  const keyword = name.trim();
  if (keyword.length < 2 || keyword.length > 80) throw new Error('장소 이름을 2~80자로 입력해 주세요.');
  try {
    const naver = await searchNaverPlaces(keyword, signal);
    if (naver?.length) return [...naver].sort(byDistance(lat, lng));
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.message.startsWith('네이버')) throw error;
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('"', '\\"');
  const around = `(around:15000,${lat.toFixed(5)},${lng.toFixed(5)})`;
  const query = `[out:json][timeout:20];(` +
    `nwr["name"~"${escaped}",i]${around};` +
    `nwr["name:ko"~"${escaped}",i]${around};` +
    `);out center 60;`;
  return runOverpass(query, signal);
}

export async function searchPlacesAtPoint(lat: number, lng: number, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  const around = `(around:100,${lat.toFixed(5)},${lng.toFixed(5)})`;
  const query = `[out:json][timeout:20];(` +
    `nwr["name"]["amenity"]${around};` +
    `nwr["name"]["tourism"]${around};` +
    `nwr["name"]["shop"]${around};` +
    `nwr["name"]["leisure"]${around};` +
    `);out center 30;`;
  const places = await runOverpass(query, signal);
  return places.sort(byDistance(lat, lng)).slice(0, 5);
}
