export interface Trip {
  id: string;
  title: string;
  dateRange: string;
  status: '기록 완료' | '계획 중';
  emoji: string;
  coverUrl: string; // 카드 대표 사진 (TODO: 사용자 업로드 사진으로 교체 예정)
  linkTo: 'diary' | 'board';
}

export interface Place {
  id: string;
  name: string;
  category: '카페' | '관광지' | '맛집' | '숙소';
  icon: string;
  description: string;
  tags: string[];
  lat: number;
  lng: number;
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  // AI가 제안하는 추천 코스 — 각 장소를 "다이어리(일정판)"로 보낼 수 있음
  course?: { placeId: string; time: string }[];
}

export interface DiaryEntry {
  id: string;
  folderId: string;
  dayLabel: string;
  rating: number;
  imageUrl: string;
  title: string;
  content: string;
  comments: number;
  likes: number;
}

export interface DiaryFolder {
  id: string;
  name: string;
}

export interface BoardCard {
  id: string;
  day: string;
  title: string;
  description: string;
  top: number;
  left: number;
  icon?: string;
  time?: string;
  imageUrl?: string;
}

// 일정판 카드 사이를 잇는 동선 연결선
export interface BoardConnection {
  id: string;
  from: string; // BoardCard.id
  to: string; // BoardCard.id
}
