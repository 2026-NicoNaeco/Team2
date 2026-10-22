const { readFileSync, writeFileSync, renameSync, unlinkSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { validBoardData, validTitle } = require('../src/boardValidation');

const MAX_BOARD_BYTES = 8 * 1024 * 1024;
const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128;
const validTimestamp = (value) => typeof value === 'string' && value.length <= 50 &&
  !Number.isNaN(Date.parse(value));

function boardData(source) {
  return {
    schemaVersion: 1,
    cards: source.cards,
    connections: source.connections,
    ...(Object.hasOwn(source, 'tripMeta') ? { tripMeta: source.tripMeta } : {}),
    ...(Object.hasOwn(source, 'tripPlaces') ? { tripPlaces: source.tripPlaces } : {}),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function checkUser(ownerId, savedBoards, existingBoards, ownerCounts = new Map()) {
  const result = { ownerId, savedBoards: 0, pending: 0, alreadyMigrated: 0, boards: [], oversized: [], errors: [] };
  if (!Array.isArray(savedBoards)) {
    result.errors.push({ ownerId, reason: 'savedBoards가 배열이 아닙니다.' });
    return result;
  }
  result.savedBoards = savedBoards.length;
  const seen = new Set();
  const migrated = new Map();
  for (const board of existingBoards) {
    if (board.legacyBoardId == null) continue;
    if (migrated.has(board.legacyBoardId)) {
      result.errors.push({ ownerId, legacyBoardId: board.legacyBoardId, reason: '이전 대상 ID가 새 저장소에 중복됩니다.' });
    }
    migrated.set(board.legacyBoardId, board);
  }
  for (const source of savedBoards) {
    const legacyBoardId = validId(source?.id) ? source.id : '(잘못된 ID)';
    if (!validId(source?.id) || !validTitle(source.title) ||
        !validTimestamp(source.createdAt) || !validTimestamp(source.updatedAt)) {
      result.errors.push({ ownerId, legacyBoardId, reason: '보드 ID·제목·시각이 올바르지 않습니다.' });
      continue;
    }
    if (seen.has(source.id)) {
      result.errors.push({ ownerId, legacyBoardId, reason: '원본 보드 ID가 중복됩니다.' });
      continue;
    }
    seen.add(source.id);
    const data = boardData(source);
    if (!validBoardData(data)) {
      result.errors.push({ ownerId, legacyBoardId, reason: '카드·연결선·방문 정보 변환에 실패했습니다.' });
      continue;
    }
    const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
    const previous = migrated.get(source.id);
    const status = previous ? '이미 이전됨' : '이전 대상';
    result.boards.push({ legacyBoardId, status, cards: data.cards.length,
      connections: data.connections.length, hasPhoto: data.cards.some((card) => Boolean(card.imageUrl)), bytes });
    if (bytes > MAX_BOARD_BYTES) {
      result.oversized.push(legacyBoardId);
      result.errors.push({ ownerId, legacyBoardId, reason: '보드 데이터가 8MB를 초과합니다.' });
    }
    if (previous) {
      result.alreadyMigrated += 1;
      if (previous.title !== source.title || !same(previous.data, data) ||
          Number(ownerCounts.get(previous.id)) !== 1 ||
          new Date(previous.createdAt).getTime() !== new Date(source.createdAt).getTime() ||
          new Date(previous.updatedAt).getTime() !== new Date(source.updatedAt).getTime()) {
        result.errors.push({ ownerId, legacyBoardId, reason: '이미 이전된 보드가 원본과 다르거나 소유자 멤버가 없습니다.' });
      }
    } else {
      result.pending += 1;
    }
  }
  return result;
}

function makeReport(users, existing, ownerCounts) {
  const report = { mode: 'dry-run', users: [], oversized: [], errors: [] };
  for (const user of users) {
    const result = checkUser(user.ownerId, user.savedBoards, existing.get(user.ownerId) || [], ownerCounts);
    report.users.push(result);
    report.oversized.push(...result.oversized.map((legacyBoardId) => ({ ownerId: user.ownerId, legacyBoardId })));
    report.errors.push(...result.errors);
  }
  return report;
}

function localSnapshot(filePath) {
  const snapshot = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!snapshot || !Array.isArray(snapshot.users) || !Array.isArray(snapshot.travelStates) ||
      (snapshot.boards !== undefined && !Array.isArray(snapshot.boards)) ||
      (snapshot.boardMembers !== undefined && !Array.isArray(snapshot.boardMembers))) {
    throw new Error('로컬 DB 파일의 users, travelStates, boards, boardMembers 형식이 올바르지 않습니다.');
  }
  snapshot.boards ??= [];
  snapshot.boardMembers ??= [];
  return snapshot;
}

function collectLocal(snapshot) {
  const userIds = new Set(snapshot.users.map((user) => user.id));
  const users = snapshot.travelStates.map((state) => {
    if (!Number.isInteger(state.ownerId) || !userIds.has(state.ownerId)) {
      throw new Error('사용자 없는 travelStates 항목이 있습니다.');
    }
    return { ownerId: state.ownerId, savedBoards: Object.hasOwn(state.data || {}, 'savedBoards')
      ? state.data.savedBoards : [] };
  });
  const existing = new Map();
  for (const board of snapshot.boards) {
    if (!existing.has(board.ownerId)) existing.set(board.ownerId, []);
    existing.get(board.ownerId).push(board);
  }
  const ownerCounts = new Map();
  for (const member of snapshot.boardMembers) {
    if (member.role === 'owner') ownerCounts.set(member.boardId, (ownerCounts.get(member.boardId) || 0) + 1);
  }
  return { users, existing, ownerCounts };
}

function assertReport(report) {
  if (report.errors.length) throw new Error(`검증 오류 ${report.errors.length}건이 있어 적용을 중단했습니다.`);
}

function applyLocal(filePath, snapshot) {
  const next = structuredClone(snapshot);
  for (const state of next.travelStates) {
    const previous = new Set(next.boards.filter((board) => board.ownerId === state.ownerId && board.legacyBoardId != null)
      .map((board) => board.legacyBoardId));
    for (const source of state.data?.savedBoards ?? []) {
      if (previous.has(source.id)) continue;
      const id = randomUUID();
      next.boards.push({ id, ownerId: state.ownerId, legacyBoardId: source.id, title: source.title,
        data: boardData(source), version: 1, createdAt: source.createdAt, updatedAt: source.updatedAt, deletedAt: null });
      next.boardMembers.push({ boardId: id, userId: state.ownerId, role: 'owner', createdAt: source.createdAt });
    }
  }
  // Verify the entire snapshot before replacing the local file.
  const collected = collectLocal(next);
  const verified = makeReport(collected.users, collected.existing, collected.ownerCounts);
  assertReport(verified);
  for (const user of verified.users) {
    if (user.alreadyMigrated !== user.savedBoards || user.pending !== 0) {
      throw new Error(`사용자 ${user.ownerId}의 이전 결과가 원본과 다릅니다.`);
    }
  }
  const temporary = `${filePath}.migrate-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx' });
    renameSync(temporary, filePath);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* Rename may already have completed. */ }
    throw error;
  }
}

async function collectPostgres(client) {
  const states = await client.query('SELECT owner_id, data FROM tteonayo.travel_states ORDER BY owner_id');
  const rows = await client.query(`SELECT b.id, b.owner_id, b.legacy_board_id, b.title, b.data,
    b.created_at, b.updated_at,
    count(m.user_id) FILTER (WHERE m.role = 'owner')::integer AS owner_count
    FROM tteonayo.boards b LEFT JOIN tteonayo.board_members m ON m.board_id = b.id
    WHERE b.legacy_board_id IS NOT NULL
    GROUP BY b.id`);
  const existing = new Map();
  const ownerCounts = new Map();
  for (const row of rows.rows) {
    if (!existing.has(row.owner_id)) existing.set(row.owner_id, []);
    existing.get(row.owner_id).push({ id: row.id, legacyBoardId: row.legacy_board_id,
      title: row.title, data: row.data, createdAt: row.created_at, updatedAt: row.updated_at });
    ownerCounts.set(row.id, row.owner_count);
  }
  return { users: states.rows.map((row) => ({ ownerId: row.owner_id,
    savedBoards: Object.hasOwn(row.data || {}, 'savedBoards') ? row.data.savedBoards : [] })),
    existing, ownerCounts };
}

async function applyPostgres(pool, owners) {
  for (const ownerId of owners) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(95041, $1)', [ownerId]);
      const state = await client.query(`SELECT data FROM tteonayo.travel_states
        WHERE owner_id = $1 FOR UPDATE`, [ownerId]);
      if (!state.rows[0]) throw new Error(`사용자 ${ownerId}의 여행 상태가 사라졌습니다.`);
      const before = await collectPostgres(client);
      const user = before.users.find((item) => item.ownerId === ownerId);
      assertReport(makeReport([user], before.existing, before.ownerCounts));
      for (const source of user.savedBoards) {
        if ((before.existing.get(ownerId) || []).some((board) => board.legacyBoardId === source.id)) continue;
        const id = randomUUID();
        await client.query(`INSERT INTO tteonayo.boards
          (id, owner_id, legacy_board_id, title, data, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [id, ownerId, source.id, source.title, JSON.stringify(boardData(source)), source.createdAt, source.updatedAt]);
        await client.query(`INSERT INTO tteonayo.board_members (board_id, user_id, role)
          VALUES ($1, $2, 'owner')`, [id, ownerId]);
      }
      const after = await collectPostgres(client);
      assertReport(makeReport([after.users.find((item) => item.ownerId === ownerId)], after.existing, after.ownerCounts));
      const verified = checkUser(ownerId, user.savedBoards, after.existing.get(ownerId) || [], after.ownerCounts);
      if (verified.alreadyMigrated !== user.savedBoards.length || verified.boards.reduce((sum, board) => sum + board.cards, 0) !==
          user.savedBoards.reduce((sum, board) => sum + board.cards.length, 0) ||
          verified.boards.reduce((sum, board) => sum + board.connections, 0) !==
          user.savedBoards.reduce((sum, board) => sum + board.connections.length, 0)) {
        throw new Error(`사용자 ${ownerId}의 이전 결과가 원본과 다릅니다.`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function runMigration({ apply = false, dbPath, databaseUrl } = {}) {
  if (dbPath && databaseUrl) throw new Error('PostgreSQL 주소와 로컬 DB 파일을 동시에 지정할 수 없습니다.');
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL 연결 주소가 올바르지 않습니다.');
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!loopback && url.searchParams.get('sslmode') === 'disable') throw new Error('원격 PostgreSQL에는 SSL이 필요합니다.');
    if (!loopback && !url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
    const pool = new Pool({ connectionString: url.toString(), max: 5 });
    try {
      const first = await collectPostgres(pool);
      let report = makeReport(first.users, first.existing, first.ownerCounts);
      if (apply) {
        assertReport(report);
        await applyPostgres(pool, first.users.map((user) => user.ownerId));
        const updated = await collectPostgres(pool);
        report = makeReport(updated.users, updated.existing, updated.ownerCounts);
        assertReport(report);
        report.mode = 'applied';
      }
      return report;
    } finally {
      await pool.end();
    }
  }
  const filePath = path.resolve(dbPath || process.env.TTEONAYO_DB_PATH || path.join(__dirname, '..', 'tteonayo.json'));
  const snapshot = localSnapshot(filePath);
  const collected = collectLocal(snapshot);
  let report = makeReport(collected.users, collected.existing, collected.ownerCounts);
  if (apply) {
    assertReport(report);
    applyLocal(filePath, snapshot);
    const updated = collectLocal(localSnapshot(filePath));
    report = makeReport(updated.users, updated.existing, updated.ownerCounts);
    assertReport(report);
    report.mode = 'applied';
  }
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const pathFlag = args.indexOf('--db-path');
  const dbPath = pathFlag < 0 ? undefined : args[pathFlag + 1];
  const expected = apply ? 1 : 0;
  if ((pathFlag >= 0 && !dbPath) || args.length !== expected + (pathFlag >= 0 ? 2 : 0)) {
    console.error('사용법: node scripts/migrateBoards.js [--db-path <로컬 JSON 경로>] [--apply]');
    process.exitCode = 1;
  } else {
    runMigration({ apply, dbPath, databaseUrl: dbPath ? undefined : process.env.DATABASE_URL })
      .then((report) => { console.log(JSON.stringify(report, null, 2)); if (report.errors.length) process.exitCode = 1; })
      .catch((error) => { console.error('이전 검사 실패:', error.message); process.exitCode = 1; });
  }
}

module.exports = { runMigration };
