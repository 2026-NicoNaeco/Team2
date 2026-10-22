require('dotenv').config();
const { readFileSync } = require('node:fs');
const path = require('node:path');
const store = require('../src/store');

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('사용법: node scripts/import-local-data.js <기존 tteonayo.json 절대경로>');
  const snapshot = JSON.parse(readFileSync(path.resolve(source), 'utf8'));
  await store.ensureReady();
  const result = await store.importLocalSnapshot(snapshot);
  console.log(`이전 완료: 사용자 ${result.users}명, 여행 데이터 ${result.states}건`);
}

main().catch((error) => {
  console.error('데이터 이전 실패:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => store.close());
