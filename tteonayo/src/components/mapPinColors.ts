import type { Place } from '../types';

// 지도 핀·목록 번호에 쓰는 분류별 색상
export const PIN_COLOR: Record<Place['category'], string> = {
  카페: '#D64545', 관광지: '#1D4A47', 맛집: '#C77D30', 숙소: '#2F6F6B',
};
