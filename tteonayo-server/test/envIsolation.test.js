const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const indexPath = path.join(__dirname, '..', 'src', 'index.js');

// 임시 폴더의 가짜 .env만 사용해, 서버가 현재 폴더의 .env를 읽는지 확인합니다.
function loadServerIn(dir, env) {
  const script = `require(${JSON.stringify(indexPath)});
    process.stdout.write(JSON.stringify({ probe: process.env.TTEONAYO_ENV_PROBE ?? null }));
    process.exit(0);`;
  const output = execFileSync(process.execPath, ['-e', script], { cwd: dir, env, encoding: 'utf8' });
  return JSON.parse(output.slice(output.lastIndexOf('{')));
}

test('npm test는 실제 .env 없이 가짜 변수와 임시 DB 경로만 사용한다', () => {
  assert.equal(process.env.TTEONAYO_SKIP_DOTENV, '1');
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.DATABASE_URL, undefined);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  assert.equal(process.env.RESEND_API_KEY, undefined);
  assert.ok(process.env.TTEONAYO_DB_PATH.startsWith(tmpdir()));

  const dir = mkdtempSync(path.join(tmpdir(), 'tteonayo-env-isolation-'));
  try {
    writeFileSync(path.join(dir, '.env'), 'TTEONAYO_ENV_PROBE=from-dotenv\n');
    const env = { ...process.env, TTEONAYO_DB_PATH: path.join(dir, 'db.json') };

    assert.equal(loadServerIn(dir, env).probe, null);

    // 대조군: 플래그가 없으면 같은 가짜 .env를 읽으므로 위 검사가 실제로 의미가 있다.
    const withoutFlag = { ...env };
    delete withoutFlag.TTEONAYO_SKIP_DOTENV;
    assert.equal(loadServerIn(dir, withoutFlag).probe, 'from-dotenv');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
