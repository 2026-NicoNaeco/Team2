import type {
  Trip,
  Place,
  ChatMessage,
  DiaryEntry,
  DiaryFolder,
  BoardCard,
  BoardConnection,
} from '../types';

// TODO: 아래 데이터는 전부 더미입니다. 실제 서비스 연동 시 각 페이지의 useEffect에서
// API 호출 결과로 교체하세요 (예: GET /api/trips, GET /api/places?tripId=... 등).

export const trips: Trip[] = [
  {
    id: 'busan-alley',
    title: '부산 골목 산책',
    dateRange: '2026.03.12 — 03.15',
    status: '기록 완료',
    emoji: '🌊',
    coverUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
    linkTo: 'diary',
  },
  {
    id: 'jeju-nature',
    title: '제주 자연 힐링 코스',
    dateRange: '2026.01.04 — 01.06',
    status: '기록 완료',
    emoji: '🌋',
    coverUrl:
      'https://images.unsplash.com/photo-1504893524553-b855bce32c67?auto=format&fit=crop&w=600&q=80',
    linkTo: 'diary',
  },
  {
    id: 'suncheon-3days',
    title: '순천 2박 3일 정원 여행',
    dateRange: '2026.10.17 예정',
    status: '계획 중',
    emoji: '🌿',
    coverUrl:
      'https://images.unsplash.com/photo-1466781783364-36c955e42a7f?auto=format&fit=crop&w=600&q=80',
    linkTo: 'board',
  },
];

// 좌표는 실제 순천 위치 기준입니다. 지도에서 핀을 드래그하면 이 값이 갱신돼요(세션 한정).
export const places: Place[] = [
  {
    id: 'jangcheon-cafe',
    name: '장천동 감성 카페',
    category: '카페',
    icon: '☕',
    description: '골목 감성 카페 · 시그니처 크로플',
    tags: ['디저트', '감성카페'],
    lat: 34.9493,
    lng: 127.4889,
  },
  {
    id: 'suncheonman-garden',
    name: '순천만 국가정원',
    category: '관광지',
    icon: '🌿',
    description: '국내 1호 국가정원 · 갈대밭 사진 포인트',
    tags: ['공원', '자연'],
    lat: 34.9412,
    lng: 127.4980,
  },
  {
    id: 'culture-street',
    name: '문화의 거리',
    category: '관광지',
    icon: '🏛️',
    description: '옥리단길 · 소품샵과 로컬 상점 골목',
    tags: ['문화', '쇼핑'],
    lat: 34.9501,
    lng: 127.4877,
  },
  {
    id: 'ocheon-cafe-street',
    name: '오천동 카페거리',
    category: '카페',
    icon: '🍰',
    description: '오천그린광장 옆 카페 밀집 거리',
    tags: ['카페', '거리'],
    lat: 34.9352,
    lng: 127.5131,
  },
  {
    id: 'suncheonman-wetland',
    name: '순천만 습지',
    category: '관광지',
    icon: '🦆',
    description: '흑두루미 탐조 · 갈대 군락 생태 탐방',
    tags: ['자연', '생태'],
    lat: 34.8876,
    lng: 127.5093,
  },
  {
    id: 'nagan-fortress',
    name: '낙안읍성',
    category: '관광지',
    icon: '🏯',
    description: '조선시대 성곽 마을 · 초가집 민속촌',
    tags: ['역사', '문화재'],
    lat: 34.9063,
    lng: 127.3396,
  },
  {
    id: 'ecovillage-hostel',
    name: '에코촌 유스호스텔',
    category: '숙소',
    icon: '🛏️',
    description: '순천만정원 도보 5분 · 조식 포함',
    tags: ['정원뷰', '조식포함'],
    lat: 34.9385,
    lng: 127.5030,
  },
];

export const chatMessages: ChatMessage[] = [
  {
    id: 'm1',
    sender: 'ai',
    text: '안녕하세요! 기존 다이어리를 바탕으로 분석한 결과, 한적한 골목 카페 투어와 도보 중심의 정적인 코스를 선호하시는 것으로 확인됩니다. 이번 순천 일정은 어떤 감성을 더해볼까요?',
  },
  {
    id: 'm2',
    sender: 'user',
    text: '가을 순천만 갈대밭 보고 싶어. 카페도 들르는 코스로 짜줘.',
  },
  {
    id: 'm3',
    sender: 'ai',
    text: '저장하신 장소를 보니 디저트 카페와 자연 코스를 선호하시네요. 순천 날씨(맑음 · 18°C)를 반영해 오전엔 골목 카페, 낮부터는 정원·습지 갈대밭 코스로 짜봤어요. 마음에 드는 장소는 "+ 다이어리"로 일정판에 담아보세요.',
    course: [
      { placeId: 'jangcheon-cafe', time: '10:00' },
      { placeId: 'culture-street', time: '12:30' },
      { placeId: 'suncheonman-garden', time: '14:30' },
      { placeId: 'suncheonman-wetland', time: '17:00' },
    ],
  },
  {
    id: 'm4',
    sender: 'ai',
    text: '실시간 정보도 확인했어요. 이번 주말 순천만 갈대밭 물빛이 가장 좋은 시간대는 일몰 1시간 전(17:30 전후)입니다.',
  },
];

export const diaryFolders: DiaryFolder[] = [
  { id: 'busan', name: '부산 2박 3일 (2026)' },
  { id: 'yeosu', name: '여수 밤바다 투어' },
  { id: 'jeju', name: '제주도 가족 휴가' },
];

export const diaryEntries: DiaryEntry[] = [
  {
    id: 'd1',
    folderId: 'busan',
    dayLabel: 'DAY 1 · 출발',
    rating: 5.0,
    imageUrl:
      'https://images.unsplash.com/photo-1570114603079-4645373f145e?auto=format&fit=crop&w=400&q=80',
    title: '📍 부산역 광장 & 초량밀면',
    content:
      '도착하자마자 화창한 하늘이 반겨주었다. 계획대로 역전 밀면집으로 직행, 시원하고 깊은 한약재 육수가 여행의 긴장감을 완벽히 풀어주었다.',
    comments: 14,
    likes: 42,
  },
  {
    id: 'd2',
    folderId: 'busan',
    dayLabel: 'DAY 1 · 오후',
    rating: 4.5,
    imageUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80',
    title: '📍 해운대 백사장 & 윤슬',
    content:
      '오후 3시의 햇살을 받아 바다가 보석처럼 빛났다. 파도 소리를 배경 삼아 모래사장을 걷는 것만으로도 완벽한 힐링. 근처 오션뷰 테라스 자리는 신의 한 수.',
    comments: 8,
    likes: 56,
  },
  {
    id: 'd3',
    folderId: 'busan',
    dayLabel: 'DAY 2 · 오전',
    rating: 5.0,
    imageUrl:
      'https://images.unsplash.com/photo-1464151746931-1306567921c6?auto=format&fit=crop&w=400&q=80',
    title: '📍 흰여울문화마을 골목길',
    content:
      '절벽 끝 아기자기한 흰 벽과 파란 바다의 조화가 이국적인 무드를 자아냈다. 소품샵 구경과 로컬 감성 바리스타가 내려주는 커피 한 잔의 여유.',
    comments: 21,
    likes: 89,
  },
  {
    id: 'd4',
    folderId: 'yeosu',
    dayLabel: 'DAY 1 · 밤',
    rating: 4.5,
    imageUrl:
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=400&q=80',
    title: '📍 여수 밤바다 & 낭만포차',
    content:
      '케이블카에서 내려다본 항구의 불빛이 노래 가사 그대로였다. 포차에서 갓 잡은 서대회무침에 소주 한 잔, 파도 소리가 안주였다.',
    comments: 11,
    likes: 63,
  },
  {
    id: 'd5',
    folderId: 'jeju',
    dayLabel: 'DAY 2 · 오전',
    rating: 5.0,
    imageUrl:
      'https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=400&q=80',
    title: '📍 성산일출봉 & 광치기해변',
    content:
      '새벽같이 올라간 정상에서 본 일출은 반칙이었다. 내려와서 만난 광치기해변의 이끼 낀 현무암은 또 다른 세상.',
    comments: 17,
    likes: 74,
  },
];

export const boardCards: BoardCard[] = [
  {
    id: 'b1',
    day: 'DAY 1',
    time: '10:00',
    icon: '☕',
    title: '장천동 감성 카페',
    description: '시그니처 크로플 꼭 먹기!',
    imageUrl:
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=400&q=80',
    top: 40,
    left: 40,
  },
  {
    id: 'b2',
    day: 'DAY 1',
    time: '12:30',
    icon: '🏛️',
    title: '문화의 거리',
    description: '옥리단길 소품샵 구경, 점심도 이 근처',
    top: 60,
    left: 360,
  },
  {
    id: 'b3',
    day: 'DAY 1',
    time: '14:30',
    icon: '🌿',
    title: '순천만 국가정원',
    description: '갈대밭 사진 포인트, 스카이큐브 탑승',
    imageUrl:
      'https://images.unsplash.com/photo-1466781783364-36c955e42a7f?auto=format&fit=crop&w=400&q=80',
    top: 360,
    left: 130,
  },
  {
    id: 'b4',
    day: 'DAY 2',
    time: '09:00',
    icon: '🦆',
    title: '순천만 습지',
    description: '흑두루미 탐조, 아침 일찍 도착 권장',
    imageUrl:
      'https://images.unsplash.com/photo-1503803548695-c2a7b4a5b875?auto=format&fit=crop&w=400&q=80',
    top: 330,
    left: 640,
  },
];

// 일정판 초기 동선 (일정판에서 카드를 두 개 클릭하면 자유롭게 추가/삭제 가능)
export const boardConnections: BoardConnection[] = [
  { id: 'c1', from: 'b1', to: 'b2' },
  { id: 'c2', from: 'b2', to: 'b3' },
  { id: 'c3', from: 'b3', to: 'b4' },
];
