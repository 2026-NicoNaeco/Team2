import { API_BASE_URL } from './apiBase';

export interface SeoulCongestionPlace {
  name: string;
  level: string;
  observedAt: string;
  source: string;
}

export interface SeoulCongestionResponse {
  status: 'ready' | 'ok' | 'unconfigured' | 'invalid_config' | 'invalid_key' | 'unavailable' | 'unsupported_place';
  places: SeoulCongestionPlace[];
  availablePlaces: string[];
}

export async function fetchSeoulCongestion(place: string | null, signal: AbortSignal): Promise<SeoulCongestionResponse> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('다시 로그인해 주세요.');
  let response: Response;
  try {
    const url = new URL(`${API_BASE_URL}/api/chat/congestion`, window.location.origin);
    url.searchParams.set('region', '서울');
    if (place) url.searchParams.set('place', place);
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }, signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('서버에 연결하지 못했어요. 실행 상태를 확인해 주세요.');
  }
  const data = await response.json() as SeoulCongestionResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || '혼잡도 정보를 불러오지 못했어요.');
  return data;
}
