export interface RegionOption {
  name: string;
  area?: string;
  coordinates?: { lat: number; lng: number };
}

// 자주 찾는 국내 여행지는 네트워크 연결 전에도 앞글자·오타 검색이 되도록 둔다.
// 목록에 없는 국내 지역은 Open-Meteo 지오코딩 검색 결과로 보완한다.
const localRegions: RegionOption[] = [
  { name: '서울' }, { name: '부산' }, { name: '대구' }, { name: '인천' },
  { name: '광주', area: '광주광역시' }, { name: '대전' }, { name: '울산' }, { name: '세종' },
  { name: '수원' }, { name: '성남' }, { name: '용인' }, { name: '고양' },
  { name: '부천' }, { name: '안산' }, { name: '안양' }, { name: '평택' },
  { name: '남양주' }, { name: '화성' }, { name: '파주' }, { name: '김포' },
  { name: '춘천' }, { name: '강릉' }, { name: '속초' }, { name: '동해' },
  { name: '삼척' }, { name: '양양' }, { name: '원주' }, { name: '평창' },
  { name: '청주' }, { name: '충주' }, { name: '제천' }, { name: '단양' },
  { name: '천안' }, { name: '아산' }, { name: '공주' }, { name: '보령' },
  { name: '서산' }, { name: '태안' }, { name: '논산' }, { name: '부여' },
  { name: '전주' }, { name: '군산' }, { name: '익산' }, { name: '남원' },
  { name: '완주' }, { name: '무주' }, { name: '순천' }, { name: '여수' },
  { name: '광양' }, { name: '목포' }, { name: '나주' }, { name: '담양' },
  { name: '보성' }, { name: '해남' }, { name: '구례' }, { name: '고흥' },
  { name: '경주' }, { name: '포항' }, { name: '안동' }, { name: '구미' },
  { name: '영주' }, { name: '문경' }, { name: '영덕' }, { name: '울진' },
  { name: '창원' }, { name: '진주' }, { name: '통영' }, { name: '거제' },
  { name: '사천' }, { name: '밀양' }, { name: '남해' }, { name: '하동' },
  { name: '제주' }, { name: '서귀포' },
];

function normalize(value: string): string {
  return value.normalize('NFC').replace(/[\s·-]/g, '').replace(/(특별자치도|특별자치시|특별시|광역시|자치도|자치시|시|군)$/, '').toLowerCase();
}

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function initials(value: string): string {
  return [...value].map((char) => {
    const code = char.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)] : char;
  }).join('');
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function syllableParts(char: string): [number, number, number] | null {
  const code = char.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return [Math.floor(code / 588), Math.floor((code % 588) / 28), code % 28];
}

function typoRank(name: string, query: string): number {
  if (editDistance(name, query) !== 1) return Number.POSITIVE_INFINITY;
  if (name.length !== query.length) return 7;
  const index = [...name].findIndex((char, position) => char !== query[position]);
  const left = syllableParts(name[index]);
  const right = syllableParts(query[index]);
  if (!left || !right) return 7;
  if (left[0] === right[0] && left[2] === right[2]) return 5;
  if (left[0] === right[0] || (left[1] === right[1] && left[2] === right[2])) return 6;
  return 7;
}

function score(option: RegionOption, rawQuery: string): number {
  const query = normalize(rawQuery);
  const name = normalize(option.name);
  const area = normalize(option.area ?? '');
  if (!query) return Number.POSITIVE_INFINITY;
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (area && area.startsWith(query)) return 2;
  if (initials(name).startsWith(query)) return 3;
  if (name.includes(query)) return 4;
  if (query.length >= 2 && Math.abs(name.length - query.length) <= 1) return typoRank(name, query);
  return Number.POSITIVE_INFINITY;
}

export function findDomesticRegions(query: string, remote: RegionOption[] = []): RegionOption[] {
  const seen = new Set<string>();
  const matches = [...localRegions, ...remote]
    .map((option) => ({ option, rank: score(option, query) }))
    .filter(({ option, rank }) => {
      const key = `${option.name}:${option.area ?? ''}`;
      const coveredByLocal = option.coordinates && localRegions.some((local) =>
        !local.area && normalize(local.name) === normalize(option.name)
      );
      if (!Number.isFinite(rank) || seen.has(key) || coveredByLocal) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.rank - b.rank || a.option.name.localeCompare(b.option.name, 'ko'));
  const best = matches[0]?.rank ?? Number.POSITIVE_INFINITY;
  return matches
    .filter(({ rank }) => rank <= (best <= 4 ? 4 : best <= 6 ? 6 : 7))
    .slice(0, 6)
    .map(({ option }) => option);
}

interface GeocodingResponse {
  results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }[];
}

export async function searchDomesticRegions(query: string, signal: AbortSignal): Promise<RegionOption[]> {
  const name = query.trim();
  if (name.length < 2 || name.length > 50) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
  url.searchParams.set('count', '10');
  url.searchParams.set('language', 'ko');
  url.searchParams.set('countryCode', 'KR');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('지역 검색에 실패했습니다.');
  const data = await response.json() as GeocodingResponse;
  return (data.results ?? [])
    .filter((item) => item.country_code === 'KR' && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item) => ({
      name: item.name,
      area: item.admin1,
      coordinates: { lat: item.latitude, lng: item.longitude },
    }));
}
