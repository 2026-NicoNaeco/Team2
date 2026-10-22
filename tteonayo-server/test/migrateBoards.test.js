const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, copyFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { runMigration } = require('../scripts/migrateBoards');

function fixture() {
  const createdAt = '2026-10-10T01:02:03.000Z';
  return { users: [{ id: 1, email: 'fixture@example.com', name: '테스트 사용자' }], nextId: 2,
    travelStates: [{ ownerId: 1, version: 7, data: { savedBoards: [{
      id: 'legacy-board-1', title: '순천 여행', createdAt, updatedAt: createdAt,
      cards: [{ id: 'card-1', day: '1일차', title: '순천만', description: '', top: 10, left: 20,
        imageUrl: 'data:image/png;base64,AAECAw==' },
      { id: 'card-2', day: '1일차', title: '카페', description: '', top: 30, left: 40 }],
      connections: [{ id: 'line-1', from: 'card-1', to: 'card-2', label: '도보 30분' }],
      tripMeta: { region: '순천', partySize: 2 },
      tripPlaces: [{ id: 'trip-1', placeId: 'place-1', snapshot: { name: '순천만' },
        status: 'scheduled', visitDate: '2026-10-10', visitOrder: 1 }],
    }] }, importIds: [], updatedAt: createdAt }] };
}

test('lowdb 복사본: dry-run 무쓰기, apply 보존, 재실행 시 중복 없음', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tteonayo-migrate-'));
  const source = path.join(dir, 'source.json');
  const copy = path.join(dir, 'copy.json');
  const input = JSON.stringify(fixture(), null, 2);
  writeFileSync(source, input);
  copyFileSync(source, copy);
  try {
    const before = readFileSync(copy, 'utf8');
    const dryRun = await runMigration({ dbPath: copy });
    assert.equal(dryRun.mode, 'dry-run');
    assert.equal(dryRun.errors.length, 0);
    assert.equal(dryRun.users[0].savedBoards, 1);
    assert.equal(dryRun.users[0].pending, 1);
    assert.equal(dryRun.users[0].boards[0].cards, 2);
    assert.equal(dryRun.users[0].boards[0].connections, 1);
    assert.equal(dryRun.users[0].boards[0].hasPhoto, true);
    assert.equal(readFileSync(copy, 'utf8'), before);

    const applied = await runMigration({ dbPath: copy, apply: true });
    assert.equal(applied.mode, 'applied');
    const migrated = JSON.parse(readFileSync(copy, 'utf8'));
    const legacy = fixture().travelStates[0].data.savedBoards[0];
    assert.deepEqual(migrated.travelStates, fixture().travelStates);
    assert.equal(migrated.boards.length, 1);
    assert.equal(migrated.boards[0].legacyBoardId, legacy.id);
    assert.equal(migrated.boards[0].createdAt, legacy.createdAt);
    assert.equal(migrated.boards[0].updatedAt, legacy.updatedAt);
    assert.deepEqual(migrated.boards[0].data.cards, legacy.cards);
    assert.deepEqual(migrated.boards[0].data.connections, legacy.connections);
    assert.deepEqual(migrated.boards[0].data.tripPlaces, legacy.tripPlaces);
    assert.deepEqual(migrated.boardMembers.map(({ boardId, userId, role }) => ({ boardId, userId, role })),
      [{ boardId: migrated.boards[0].id, userId: 1, role: 'owner' }]);
    assert.equal(readFileSync(source, 'utf8'), input);

    const second = await runMigration({ dbPath: copy, apply: true });
    assert.equal(second.users[0].alreadyMigrated, 1);
    assert.equal(second.users[0].pending, 0);
    assert.equal(JSON.parse(readFileSync(copy, 'utf8')).boards.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('변환 불가 항목은 보고하고 apply를 거절하며 원본을 유지한다', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tteonayo-migrate-invalid-'));
  const copy = path.join(dir, 'invalid.json');
  const snapshot = fixture();
  snapshot.travelStates[0].data.savedBoards[0].connections[0].to = '없는 카드';
  const input = JSON.stringify(snapshot);
  writeFileSync(copy, input);
  try {
    const report = await runMigration({ dbPath: copy });
    assert.equal(report.errors.length, 1);
    await assert.rejects(runMigration({ dbPath: copy, apply: true }), /검증 오류 1건/);
    assert.equal(readFileSync(copy, 'utf8'), input);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
