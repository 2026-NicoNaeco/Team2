// `npm test` 전용 사전 로드 파일. 실제 .env를 읽지 않고 가짜 값만으로 테스트를 실행합니다.
// node --test가 띄우는 하위 프로세스도 이 환경변수를 그대로 물려받습니다.
const { tmpdir } = require('node:os');
const path = require('node:path');

process.env.TTEONAYO_SKIP_DOTENV = '1';
process.env.NODE_ENV = 'test';

// 셸에 남아 있을 수 있는 실제 키와 운영 설정을 제거합니다.
for (const name of [
  'DATABASE_URL', 'CLIENT_ORIGINS', 'RAILWAY_ENVIRONMENT_ID', 'PORT',
  'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'APP_PUBLIC_URL',
  'OPENAI_API_KEY', 'OPENAI_MODEL',
  'NAVER_API_HUB_CLIENT_ID', 'NAVER_API_HUB_CLIENT_SECRET',
  'NAVER_SEARCH_CLIENT_ID', 'NAVER_SEARCH_CLIENT_SECRET',
  'SEOUL_CITYDATA_API_KEY', 'SEOUL_CITYDATA_API_URL',
]) {
  delete process.env[name];
}

process.env.JWT_SECRET = 'test-secret-only-for-isolated-tests';
// 각 테스트가 임시 경로를 지정하지만, 빠뜨려도 서버 폴더의 tteonayo.json을 쓰지 않게 합니다.
process.env.TTEONAYO_DB_PATH = path.join(tmpdir(), `tteonayo-test-fallback-${process.pid}.json`);
