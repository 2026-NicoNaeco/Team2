export interface RegionWeather {
  location: string;
  temperature: number;
  condition: string;
  observedAt: string;
}

interface GeocodingResponse {
  results?: { name: string; country?: string; latitude: number; longitude: number }[];
}

interface ForecastResponse {
  current?: { temperature_2m?: number; weather_code?: number; time?: string };
}

function describeWeather(code: number): string {
  if (code === 0) return '맑음';
  if (code <= 3) return '구름';
  if (code <= 48) return '안개';
  if (code <= 67) return '비';
  if (code <= 77) return '눈';
  if (code <= 82) return '소나기';
  if (code <= 86) return '눈';
  if (code <= 99) return '뇌우';
  return '상태 확인 불가';
}

export async function fetchRegionWeather(region: string, signal: AbortSignal): Promise<RegionWeather> {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodingUrl.searchParams.set('name', region);
  geocodingUrl.searchParams.set('count', '1');
  geocodingUrl.searchParams.set('language', 'ko');
  const locationResponse = await fetch(geocodingUrl, { signal });
  if (!locationResponse.ok) throw new Error('지역을 찾지 못했습니다.');
  const locationData = await locationResponse.json() as GeocodingResponse;
  const location = locationData.results?.[0];
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error('지역을 찾지 못했습니다. 도시 이름을 확인해주세요.');
  }

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(location.latitude));
  forecastUrl.searchParams.set('longitude', String(location.longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,weather_code');
  forecastUrl.searchParams.set('timezone', 'auto');
  const forecastResponse = await fetch(forecastUrl, { signal });
  if (!forecastResponse.ok) throw new Error('날씨를 불러오지 못했습니다.');
  const forecast = await forecastResponse.json() as ForecastResponse;
  const current = forecast.current;
  if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
    throw new Error('날씨 정보가 없습니다.');
  }
  return {
    location: [location.name, location.country].filter(Boolean).join(', '),
    temperature: current.temperature_2m,
    condition: describeWeather(current.weather_code),
    observedAt: current.time ?? '',
  };
}
