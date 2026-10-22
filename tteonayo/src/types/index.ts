export interface Trip {
  id: string;
  title: string;
  dateRange: string;
  status: '기록 완료' | '계획 중';
  coverUrl: string; // 카드 대표 사진 (TODO: 사용자 업로드 사진으로 교체 예정)
  linkTo: 'diary' | 'board';
}

export interface Place {
  id: string;
  source?: 'openstreetmap' | 'kakao' | 'naver' | 'manual';
  sourceId?: string;
  name: string;
  category: '카페' | '관광지' | '맛집' | '숙소';
  description: string;
  tags: string[];
  lat: number;
  lng: number;
  address?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  createdAt?: string;
  sources?: { title: string; url: string }[];
  // AI가 제안하는 추천 코스 — 각 장소를 "다이어리(일정판)"로 보낼 수 있음
  course?: { placeId: string; time: string }[];
}

export interface ChatConversation {
  id: string;
  region: string;
  regionCountryCode?: 'KR';
  regionCoordinates?: { lat: number; lng: number };
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface DiaryNote {
  id: string;
  folderId: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface DiaryFolder {
  id: string;
  name: string;
}

export interface BoardCard {
  id: string;
  kind?: 'text';
  textWidth?: number;
  textFontSize?: number;
  textBold?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  day: string;
  title: string;
  description: string;
  top: number;
  left: number;
  time?: string;
  imageUrl?: string;
  placeId?: string;
  address?: string;
}

// 일정판 카드 사이를 잇는 동선 연결선
export interface BoardConnection {
  id: string;
  from: string; // BoardCard.id
  to: string; // BoardCard.id
  label?: string; // 장소 사이 이동시간·메모
  transportMode?: 'walk' | 'transit' | 'car' | 'other';
  durationMinutes?: number;
  description?: string;
  durationSource?: 'manual' | 'route_api';
}

export interface SavedBoard {
  id: string;
  title: string;
  cards: BoardCard[];
  connections: BoardConnection[];
  createdAt: string;
  updatedAt: string;
  tripMeta?: TripMeta;
  tripPlaces?: TripPlace[];
}

export interface BoardApiData {
  schemaVersion: 1;
  cards: BoardCard[];
  connections: BoardConnection[];
  tripMeta?: TripMeta;
  tripPlaces?: TripPlace[];
}

export type BoardRole = 'owner' | 'editor' | 'viewer';

export interface BoardApiMember {
  userId: number;
  nickname: string;
  role: BoardRole;
}

export interface BoardApiSummary {
  id: string;
  ownerId: number;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  role: BoardRole;
  legacyBoardId?: string | null;
}

export interface BoardApiBoard extends BoardApiSummary {
  data: BoardApiData;
  members: BoardApiMember[];
}

export interface BoardApiResponse { board: BoardApiBoard }
export interface BoardListResponse { boards: BoardApiSummary[] }

export interface TripMeta {
  region: string;
  startDate?: string;
  endDate?: string;
  partySize: number;
  totalBudget?: number | null;
}

export interface TripPlace {
  id: string;
  placeId: string;
  snapshot: { name: string; address?: string; lat?: number; lng?: number };
  status: 'candidate' | 'scheduled' | 'unassigned';
  origin?: 'saved' | 'ai';
  visitDate?: string;
  visitOrder?: number;
  visitTime?: string;
  timeMeaning?: 'separate';
  reservationTime?: string;
  reservationUrl?: string;
  note?: string;
  cost?: number | null;
  costBasis?: 'per_person' | 'group';
  stayMinutes?: number;
}
