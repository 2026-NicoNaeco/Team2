# 떠나요 (tteonayo)

AI 기반 여행 계획 · 기록 웹서비스 

지난 여행에서 남긴 장소·취향을 AI가 분석해 다음 여행 일정을 추천해주는 서비스입니다.
**기록 → AI 분석 → 다음 여행 계획**의 흐름을 지도 · AI채팅 · 화이트보드형 일정판 · 기록함으로 한 곳에서 제공합니다.

## 폴더 구조

```
.
├── tteonayo/          프론트엔드 (React 19 + Vite + TypeScript + TailwindCSS v4)
└── tteonayo-server/   백엔드 (Node.js + Express + lowdb, JWT 인증)
```

## 실행 방법

**1) 백엔드** (포트 4000)

```bash
cd tteonayo-server
npm install
npm start
```

> 포트·JWT 서명키를 바꾸려면 `tteonayo-server/.env` 파일을 만들어 `PORT` / `JWT_SECRET` 지정 (안 해도 기본값으로 실행됨).

**2) 프론트엔드** (포트 5173)

```bash
cd tteonayo
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 → 회원가입 후 이용.

## 현재 상태

- **인증**만 실제 백엔드 연동 완료 (`/api/auth/signup`, `/login`, `/me`)
- 지도 · AI채팅 · 일정판 · 기록함 화면은 더미데이터(`tteonayo/src/data/mockData.ts`)로 동작하며,
  사용자가 만든 데이터(저장 장소 · 메모 · 일정판 카드 등)는 임시로 브라우저 localStorage에 저장됨
- 서버 API로 옮겨야 하는 지점은 코드에 `// TODO` 주석으로 표시
- 데이터 타입 정의: `tteonayo/src/types/index.ts`

## 주요 화면

| 경로 | 화면 | 설명 |
|---|---|---|
| `/home` | 홈 | 통계, AI 추천, 최근 여행 |
| `/map` | 지도 | 장소 저장 · 메모, 핀 드래그 (Leaflet + OpenStreetMap) |
| `/chat` | AI채팅 | 코스 추천, "+ 다이어리"로 일정판에 담기 |
| `/board` | 일정판 | 카드 드래그 · 편집, 동선 연결, 친구 초대, PDF 저장 |
| `/diary` | 기록함 | 폴더별 여행 다이어리 |
