# 떠나요 서버 저장소

`DATABASE_URL`이 있는 운영 환경은 PostgreSQL을 사용합니다. 로컬 개발에서만 `lowdb` JSON 파일을 사용합니다.

일정판 참여자는 소유자를 포함해 최대 4명입니다. PostgreSQL에서는 멤버 추가 트랜잭션이 보드 행을 `FOR UPDATE`로 잠근 뒤 인원을 확인합니다. **lowdb의 4명 제한은 개발용 단일 서버 프로세스에서만 보장됩니다.** 여러 프로세스나 운영 배포에서는 PostgreSQL을 사용해야 합니다.

보드 API(`/api/boards`, 모두 JWT 필요)는 목록·생성·조회·수정·삭제와 참여자 관리를 제공합니다.

- `POST /api/boards/:boardId/members` `{ email }`: 소유자가 이미 가입한 사용자를 이메일로 **편집자**로 추가합니다. 미가입·중복·정원 초과는 모두 같은 409 "추가할 수 없어요"로 응답해 가입 여부를 드러내지 않습니다.
- `DELETE /api/boards/:boardId/members/:userId`: 소유자가 편집자·열람자를 제거합니다. 소유자 자신은 제거할 수 없습니다. 제거된 사용자는 다음 요청부터 404를 받습니다.
- 역할: 소유자(수정·삭제·참여자 관리), 편집자(수정), 열람자(조회만, 수정 시 403). 열람자 역할은 서버 서비스에 있지만 현재 HTTP로는 편집자만 추가합니다.
- 비멤버와 존재하지 않는 보드는 같은 404입니다. 조회 응답의 참여자 목록에는 닉네임·역할만 있고 이메일은 없습니다.
- 수정은 `expectedVersion`을 포함한 PUT이며 버전이 다르면 409, 요청이 8MB를 넘으면 413입니다. 삭제는 `deleted_at` soft delete입니다.
- 공개 링크·초대 토큰·실시간 공동 편집(WebSocket, 접속자 표시, 동시 수정 병합)은 아직 없습니다.

기존 `/api/travel/state`는 그대로 유지합니다.

검증: `npm test`

테스트는 `scripts/isolateTestEnv.js`를 먼저 불러와 실제 `.env`를 읽지 않고, 셸의 운영 키를 지운 뒤 가짜 `JWT_SECRET`과 OS 임시 폴더의 lowdb만 사용합니다. PostgreSQL 통합 테스트는 로컬 PostgreSQL 관리자 주소 `TEST_POSTGRES_ADMIN_URL`을 직접 지정했을 때만 임시 DB를 만들어 실행됩니다.
