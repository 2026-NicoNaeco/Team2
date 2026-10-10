import type { Place } from '../types';

// 지도 공급자가 바뀌어도 화면과 저장 데이터는 이 형태만 사용한다.
export type PlaceCandidate = Pick<Place, 'name' | 'category' | 'lat' | 'lng' | 'address'> & {
  source: 'openstreetmap' | 'kakao';
  sourceId: string;
};

// 카카오 로컬 API의 documents 항목을 같은 저장 모델로 변환한다.
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
// 카카오 로컬 검색을 연결할 때는 이 함수의 반환 형태만 맞추면 된다.
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

export function searchNearbyPlaces(lat: number, lng: number, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  const around = `(around:2500,${lat.toFixed(5)},${lng.toFixed(5)})`;
  const query = `[out:json][timeout:20];(` +
    `nwr["amenity"~"^(cafe|restaurant|fast_food|food_court)$"]["name"]${around};` +
    `nwr["tourism"~"^(attraction|museum|viewpoint|hotel|guest_house|hostel|motel)$"]["name"]${around};` +
    `nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]${around};` +
    `);out center 200;`;
  return runOverpass(query, signal);
}

export function searchPlacesByName(name: string, lat: number, lng: number, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  const keyword = name.trim();
  if (keyword.length < 2 || keyword.length > 80) throw new Error('장소 이름을 2~80자로 입력해 주세요.');
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('"', '\\"');
  const around = `(around:15000,${lat.toFixed(5)},${lng.toFixed(5)})`;
  const query = `[out:json][timeout:20];(` +
    `nwr["name"~"${escaped}",i]${around};` +
    `nwr["name:ko"~"${escaped}",i]${around};` +
    `);out center 60;`;
  return runOverpass(query, signal);
}
