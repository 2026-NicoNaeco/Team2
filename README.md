# 떠나요

국내 여행의 장소를 저장하고 화이트보드형 일정판에서 동선을 만드는 웹서비스입니다.

## 현재 구조

| 폴더 | 역할 |
|---|---|
| `tteonayo` | React 19, TypeScript, Vite, React Router, Tailwind CSS, Leaflet |
| `tteonayo-server` | Express 5, JWT 로그인, Supabase PostgreSQL 저장(로컬 개발은 lowdb) |

배포 환경에서는 사용자·여행 데이터를 Supabase PostgreSQL의 `tteonayo` 스키마에 저장합니다. `DATABASE_URL`이 없는 로컬 개발에서는 기존 `tteonayo-server/tteonayo.json`을 사용합니다. 브라우저 저장소는 기존 데이터 가져오기와 복구용 백업으로 사용합니다. 사진은 현재 일정판 데이터 안에 압축된 이미지로 저장되며, Supabase Storage는 아직 연결되지 않았습니다.

사이드바의 `계정 설정`에서 닉네임을 수정하고, 현재 비밀번호를 확인한 뒤 새 비밀번호로 변경할 수 있습니다. 비밀번호 변경 시 이전 로그인 토큰은 무효화되고 현재 화면에는 새 토큰이 저장됩니다. 서버는 기존 PostgreSQL 계정 테이블에 데이터 손실 없이 `token_version` 열을 추가합니다. 기존 로컬 JSON 계정은 다음 비밀번호 변경 때 이 값이 저장됩니다.

## 로컬 실행

터미널 두 개에서 각각 실행합니다.

```bash
cd tteonayo-server
npm install
npm start
```

```bash
cd tteonayo
npm install
npm run dev
```

프런트엔드가 표시한 로컬 주소로 접속해 로그인합니다. 서버의 기본 포트는 `4000`입니다. 개발 중 `DATABASE_URL`이 없고 `JWT_SECRET`도 없으면 서버가 무작위 키를 생성해 로컬 DB에 저장합니다. PostgreSQL을 쓰거나 배포할 때는 `DATABASE_URL`과 `JWT_SECRET`을 설정해야 합니다.

서버 환경변수 예시는 `tteonayo-server/.env.example`에 있습니다. 같은 폴더에 `.env`로 복사해 사용하세요. `OPENAI_API_KEY`는 여행 가이드 AI에 사용합니다. 장소 이름 검색은 네이버클라우드 NAVER API HUB의 지역 검색 키(`NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`) 또는 네이버 Developers 지역 검색 키(`NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`)를 사용합니다. 둘 다 있으면 API HUB를 우선합니다. 두 방식 모두 지도 Maps 키와 별개입니다. 검색 키가 없으면 기존 OpenStreetMap 검색을 사용합니다. 실제 비밀키를 `.env.example`이나 프런트엔드 코드에 적지 마세요.

프런트엔드 로컬 환경변수 예시는 `tteonayo/.env.local.example`에 있습니다. 같은 폴더의 `.env.local`로 복사해 네이버클라우드 Maps Web Dynamic Map용 Client ID를 입력하고 개발 서버를 다시 시작하세요. 네이버클라우드 Maps Application에 로컬 접속 주소를 등록해야 합니다. 실제 `.env.local`은 Git에서 제외됩니다. Client Secret은 프런트엔드에 넣지 마세요.

### 네이버 지도와 장소 이름 검색 연결

1. **지도:** 네이버클라우드 콘솔의 `Application Services > Maps > Application`에서 현재 앱에 **Dynamic Map**을 선택하고 Web 서비스 URL에 실제 프런트엔드 접속 주소(로컬 주소와 Vercel 도메인)를 등록합니다. Maps 앱의 **Client ID**만 `tteonayo/.env.local`의 `VITE_NAVER_MAPS_CLIENT_ID`에 입력합니다. Vercel에도 같은 변수명으로 설정합니다. 지도 표시와 저장 장소 마커에 쓰이며, Maps의 Geocoding·Reverse Geocoding·Directions는 현재 장소 이름 검색에 필요하지 않습니다.
2. **장소 검색:** 별도 메뉴인 `Application Services > NAVER API HUB > Subscription`에서 이용 신청 후 `Application`에서 **NAVER 검색 > 지역** API를 선택해 앱을 등록합니다. 이 앱의 `[인증 정보]`에서 Client ID와 Client Secret을 확인합니다. Maps 앱 키나 네이버클라우드 계정의 일반 Access Key/Secret Key와 혼동하지 마세요.
3. API HUB Client ID는 `tteonayo-server/.env`의 `NAVER_API_HUB_CLIENT_ID`, Client Secret은 `NAVER_API_HUB_CLIENT_SECRET`에 입력하고 서버를 다시 시작합니다. Railway에도 이 두 변수를 설정하면 배포된 장소 검색에 적용됩니다. 키를 채팅·코드·Git에 붙여넣지 마세요. 기존 네이버 Developers의 검색 앱이 있다면 API HUB 대신 `NAVER_SEARCH_CLIENT_ID`와 `NAVER_SEARCH_CLIENT_SECRET`을 사용할 수도 있습니다.
4. 지도에서 `순천 카페`처럼 **지역명 + 장소명**으로 검색해 결과를 선택한 후 `내 장소에 저장`을 누릅니다. 저장된 장소는 일정판의 저장 장소 목록에서 불러올 수 있습니다. 인증 오류가 보이면 **검색 앱에 지역 API를 선택했는지**, 두 값이 **같은 검색 앱에서 나온 쌍인지** 확인합니다. 지도 자체가 안 뜨면 Maps 앱의 Dynamic Map 선택과 Web 서비스 URL을 확인합니다. 지도 바탕의 상호명은 지도 SDK 클릭만으로 장소 객체가 반환되지 않아, 검색 결과에서 선택하거나 지도 위치의 주변 후보에서 저장해야 합니다.

## Vercel · Railway · Supabase 배포 설정

- Railway 백엔드의 Root Directory를 `tteonayo-server`로 지정하고 `npm start`로 실행합니다. Supabase Connect 화면의 **Session pooler PostgreSQL URI**를 Railway 변수 `DATABASE_URL`에 입력합니다. `JWT_SECRET`에는 긴 무작위 문자열을, `CLIENT_ORIGINS`에는 Vercel 프런트엔드의 정확한 HTTPS 주소를 입력합니다. OpenAI·서울시·네이버 지역 검색 키도 사용하는 경우 Railway 변수에만 입력합니다. 서버는 데이터베이스 연결 후 `tteonayo` 스키마와 필요한 두 테이블을 없으면 생성합니다. Supabase URL·Service Role Key는 이 연결 방식에 필요하지 않습니다.
- Vercel 프런트엔드의 Root Directory를 `tteonayo`로 지정합니다. `VITE_API_BASE_URL`에 Railway 백엔드의 공개 HTTPS 주소를 입력하고, 네이버 지도를 쓴다면 `VITE_NAVER_MAPS_CLIENT_ID`도 설정합니다. `vercel.json`은 React Router의 새로고침 경로를 `index.html`로 돌립니다. 네이버 지도 콘솔에는 배포된 Vercel 도메인을 등록해야 합니다.
- 기존 로컬 `tteonayo.json`의 계정·여행 데이터를 옮기려면 **비어 있는** Supabase DB를 준비하고 로컬 서버 `.env`의 `DATABASE_URL`을 설정한 다음 `node scripts/import-local-data.js <기존 tteonayo.json 경로>`를 한 번 실행합니다. 대상 DB에 데이터가 있으면 중단하고 로컬 원본은 변경하지 않습니다. 기존 로그인 토큰은 새 `JWT_SECRET`으로 다시 로그인해야 합니다. 이 스크립트는 자동 실행되지 않습니다.

## 기존 브라우저 데이터

로그인 후 해당 계정의 서버 데이터가 비어 있으면 기존 장소·일정판·채팅 데이터를 한 번 가져옵니다. 같은 가져오기 요청은 중복 반영되지 않습니다. 서버와 브라우저의 데이터가 서로 다르고 안전하게 합칠 수 없으면 자동으로 덮어쓰지 않습니다. 이때 화면에서 브라우저 데이터를 JSON으로 백업한 뒤 서버 데이터를 열 수 있습니다. 서로 다른 내용의 자동 병합·백업 파일 재가져오기는 아직 지원하지 않습니다.

## 현재 기능과 제약

- 지도: `VITE_NAVER_MAPS_CLIENT_ID`를 설정하면 네이버 Web Dynamic Map을 사용하고, 키가 없으면 기존 OpenStreetMap 지도를 사용합니다. 이름 검색은 NAVER API HUB 또는 네이버 Developers 지역 검색 키가 설정되면 그 결과를 우선 사용하고, 없으면 OpenStreetMap/Overpass를 사용합니다. 검색 API 인증이 실패하면 지도 화면에 오류를 표시합니다. 지도 클릭 지점의 가까운 장소 후보는 OpenStreetMap에서 찾습니다. 네이버 지도 바탕에 그려진 상호명을 웹 SDK가 직접 장소 정보로 반환하지는 않아, 그 장소가 검색 데이터에 없으면 직접 추가해야 합니다. 저장한 장소는 일정판에서 불러올 수 있습니다.
- 일정판: 왼쪽 날짜별 일정 목록과 중앙 화이트보드에서 저장 장소·메모·사진 카드, 카드 위치, 연결선을 편집합니다. 방문 순서와 카드 위치는 별도로 저장됩니다. 상단에 입력된 비용 합계와 예산을 표시하고, 여행 설정과 카드 상세는 필요할 때 엽니다. 서버 저장·다시 열기와 브라우저 인쇄를 통한 PDF 저장을 지원합니다. 기존 날짜 없는 장소 카드는 `미분류`로 보존합니다.
- 기록함: 저장한 일정판 목록에서 열기·삭제·공유를 합니다. 소유자는 이미 가입한 친구의 이메일을 입력해 편집자로 추가하고 제거할 수 있으며, 참여자는 소유자 포함 최대 4명입니다. 다른 참여자에게는 닉네임과 역할만 보이고 이메일은 공개되지 않습니다. 권한은 서버에서 확인하며, 참여자가 아니거나 제거된 사용자는 일정판에 접근할 수 없습니다. 공개 링크·초대 링크와 실시간 공동 편집(접속자 표시, 동시 수정 병합)은 아직 없습니다. 여러 명이 같은 일정판을 저장하면 나중 저장은 버전 충돌로 거절되며, 다시 불러온 뒤 수정해야 합니다.
- 채팅: 지역별 대화를 서버에 저장하고 Open-Meteo 현재 날씨와 지원하는 서울 관광지의 현재 혼잡도를 조회합니다. `OPENAI_API_KEY`가 설정된 서버는 현재 여행 일정과 지도에 저장한 장소를 참고해 AI 답변을 제공합니다. 숙소 질문에는 웹 검색을 사용하며 객실 가격·예약 가능 여부를 별도 API로 제공하지 않습니다.

## 검증

```bash
cd tteonayo
npm run build
npm run lint
```

```bash
cd tteonayo-server
npm test
```

서버 테스트는 실제 `.env`를 읽지 않고 가짜 환경변수와 별도 임시 DB에서 인증·소유권·가져오기 중복·버전 충돌·입력 검증을 확인합니다.
