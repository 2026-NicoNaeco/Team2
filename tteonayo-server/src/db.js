// 순수 JS 기반 로컬 DB (lowdb) — 네이티브 컴파일이 필요 없어서 별도 빌드 도구 설치가 필요 없어요.
// 데이터는 tteonayo.json 파일에 저장됩니다.
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, '..', 'tteonayo.json'));
const db = low(adapter);

db.defaults({ users: [], nextId: 1 }).write();

module.exports = db;
