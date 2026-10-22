const { randomUUID } = require('node:crypto');

const MAX_MEMBERS = 4;

function fromRow(row) {
  return row && {
    id: row.id, ownerId: row.owner_id, title: row.title, data: row.data,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

module.exports = function createBoardStore({ pool, local }) {
  async function transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function list(userId) {
    if (local) {
      const ids = new Map(local.get('boardMembers').value().filter((member) => member.userId === userId)
        .map((member) => [member.boardId, member.role]));
      return local.get('boards').value().filter((board) => !board.deletedAt && ids.has(board.id))
        .map(({ id, ownerId, title, version, createdAt, updatedAt, legacyBoardId }) =>
          ({ id, ownerId, title, version, createdAt, updatedAt, legacyBoardId, role: ids.get(id) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    const result = await pool.query(`SELECT b.id, b.owner_id, b.title, b.version, b.created_at, b.updated_at, b.legacy_board_id, m.role
      FROM tteonayo.boards b JOIN tteonayo.board_members m ON m.board_id = b.id
      WHERE m.user_id = $1 AND b.deleted_at IS NULL ORDER BY b.updated_at DESC`, [userId]);
    return result.rows.map((row) => ({
      id: row.id, ownerId: row.owner_id, title: row.title, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at, legacyBoardId: row.legacy_board_id, role: row.role,
    }));
  }

  async function findTripForMember(userId, region) {
    if (local) {
      const memberIds = new Set(local.get('boardMembers').value()
        .filter((member) => member.userId === userId).map((member) => member.boardId));
      const board = local.get('boards').value().filter((item) => !item.deletedAt && memberIds.has(item.id) &&
        item.data?.tripMeta?.region?.trim() === region)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      return board?.data ?? null;
    }
    const result = await pool.query(`SELECT b.data FROM tteonayo.boards b
      JOIN tteonayo.board_members m ON m.board_id = b.id
      WHERE m.user_id = $1 AND b.deleted_at IS NULL
        AND trim(b.data->'tripMeta'->>'region') = $2
      ORDER BY b.updated_at DESC LIMIT 1`, [userId, region]);
    return result.rows[0]?.data ?? null;
  }

  async function get(boardId, userId) {
    if (local) {
      const board = local.get('boards').find({ id: boardId }).value();
      const membership = local.get('boardMembers').find({ boardId, userId }).value();
      if (!board || board.deletedAt || !membership) return null;
      const users = new Map(local.get('users').value().map((user) => [user.id, user.name]));
      const members = local.get('boardMembers').value().filter((member) => member.boardId === boardId)
        .map(({ userId: id, role }) => ({ userId: id, nickname: users.get(id), role }));
      return { board: { ...board }, role: membership.role, members };
    }
    const result = await pool.query(`SELECT b.*, m.role FROM tteonayo.boards b
      JOIN tteonayo.board_members m ON m.board_id = b.id AND m.user_id = $2
      WHERE b.id = $1 AND b.deleted_at IS NULL`, [boardId, userId]);
    if (!result.rows[0]) return null;
    const members = await pool.query(`SELECT m.user_id, u.name AS nickname, m.role
      FROM tteonayo.board_members m JOIN tteonayo.users u ON u.id = m.user_id
      WHERE m.board_id = $1 ORDER BY m.created_at`, [boardId]);
    return { board: fromRow(result.rows[0]), role: result.rows[0].role,
      members: members.rows.map((row) => ({ userId: row.user_id, nickname: row.nickname, role: row.role })) };
  }

  async function create(ownerId, title, data) {
    const id = randomUUID();
    if (local) {
      const now = new Date().toISOString();
      const board = { id, ownerId, title, data, version: 1, createdAt: now, updatedAt: now, deletedAt: null,
        legacyBoardId: null };
      local.set('boards', [...local.get('boards').value(), board])
        .set('boardMembers', [...local.get('boardMembers').value(),
          { boardId: id, userId: ownerId, role: 'owner', createdAt: now }]).write();
      return board;
    }
    return transaction(async (client) => {
      const result = await client.query(`INSERT INTO tteonayo.boards (id, owner_id, title, data)
        VALUES ($1, $2, $3, $4::jsonb) RETURNING *`, [id, ownerId, title, JSON.stringify(data)]);
      await client.query(`INSERT INTO tteonayo.board_members (board_id, user_id, role)
        VALUES ($1, $2, 'owner')`, [id, ownerId]);
      return fromRow(result.rows[0]);
    });
  }

  async function update(boardId, expectedVersion, title, data) {
    if (local) {
      const board = local.get('boards').find({ id: boardId }).value();
      if (!board || board.deletedAt) return { status: 'missing' };
      if (board.version !== expectedVersion) return { status: 'conflict', currentVersion: board.version };
      const next = { ...board, title, data, version: board.version + 1, updatedAt: new Date().toISOString() };
      local.get('boards').find({ id: boardId }).assign(next).write();
      return { status: 'saved', board: next };
    }
    const result = await pool.query(`UPDATE tteonayo.boards SET title = $3, data = $4::jsonb,
      version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $2 AND deleted_at IS NULL RETURNING *`,
    [boardId, expectedVersion, title, JSON.stringify(data)]);
    if (result.rows[0]) return { status: 'saved', board: fromRow(result.rows[0]) };
    const current = await pool.query(`SELECT version FROM tteonayo.boards WHERE id = $1 AND deleted_at IS NULL`, [boardId]);
    return current.rows[0] ? { status: 'conflict', currentVersion: current.rows[0].version } : { status: 'missing' };
  }

  async function remove(boardId) {
    if (local) {
      const board = local.get('boards').find({ id: boardId }).value();
      if (!board || board.deletedAt) return false;
      local.get('boards').find({ id: boardId }).assign({ deletedAt: new Date().toISOString() }).write();
      return true;
    }
    const result = await pool.query(`UPDATE tteonayo.boards SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [boardId]);
    return result.rowCount === 1;
  }

  // Member changes are not exposed as an HTTP endpoint in stage A.
  // Locking the parent board serializes concurrent joins in PostgreSQL.
  async function addMember(boardId, actorId, userId, role) {
    if (local) {
      const board = local.get('boards').find({ id: boardId }).value();
      if (!board || board.deletedAt) return { status: 'missing' };
      if (board.ownerId !== actorId) return { status: 'forbidden' };
      if (!local.get('users').find({ id: userId }).value()) return { status: 'user_missing' };
      const members = local.get('boardMembers').value().filter((member) => member.boardId === boardId);
      if (members.some((member) => member.userId === userId)) return { status: 'existing' };
      if (members.length >= MAX_MEMBERS) return { status: 'full' };
      local.get('boardMembers').push({ boardId, userId, role, createdAt: new Date().toISOString() }).write();
      return { status: 'added' };
    }
    return transaction(async (client) => {
      const result = await client.query(`SELECT owner_id FROM tteonayo.boards
        WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [boardId]);
      if (!result.rows[0]) return { status: 'missing' };
      if (result.rows[0].owner_id !== actorId) return { status: 'forbidden' };
      const user = await client.query('SELECT id FROM tteonayo.users WHERE id = $1', [userId]);
      if (!user.rows[0]) return { status: 'user_missing' };
      const existing = await client.query(`SELECT user_id FROM tteonayo.board_members
        WHERE board_id = $1 AND user_id = $2`, [boardId, userId]);
      if (existing.rows[0]) return { status: 'existing' };
      const count = await client.query(`SELECT count(*)::integer AS members FROM tteonayo.board_members
        WHERE board_id = $1`, [boardId]);
      if (count.rows[0].members >= MAX_MEMBERS) return { status: 'full' };
      await client.query(`INSERT INTO tteonayo.board_members (board_id, user_id, role)
        VALUES ($1, $2, $3)`, [boardId, userId, role]);
      return { status: 'added' };
    });
  }

  async function removeMember(boardId, actorId, userId) {
    if (local) {
      const board = local.get('boards').find({ id: boardId }).value();
      const actor = local.get('boardMembers').find({ boardId, userId: actorId }).value();
      if (!board || board.deletedAt || !actor) return { status: 'missing' };
      if (actor.role !== 'owner') return { status: 'forbidden' };
      if (userId === board.ownerId) return { status: 'owner_protected' };
      const member = local.get('boardMembers').find({ boardId, userId }).value();
      if (!member) return { status: 'member_missing' };
      local.get('boardMembers').remove({ boardId, userId }).write();
      return { status: 'removed' };
    }
    return transaction(async (client) => {
      const board = await client.query(`SELECT owner_id FROM tteonayo.boards
        WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [boardId]);
      if (!board.rows[0]) return { status: 'missing' };
      const actor = await client.query(`SELECT role FROM tteonayo.board_members
        WHERE board_id = $1 AND user_id = $2`, [boardId, actorId]);
      if (!actor.rows[0]) return { status: 'missing' };
      if (actor.rows[0].role !== 'owner') return { status: 'forbidden' };
      if (userId === board.rows[0].owner_id) return { status: 'owner_protected' };
      const result = await client.query(`DELETE FROM tteonayo.board_members
        WHERE board_id = $1 AND user_id = $2 AND role <> 'owner'`, [boardId, userId]);
      return { status: result.rowCount === 1 ? 'removed' : 'member_missing' };
    });
  }

  return { list, findTripForMember, get, create, update, remove, addMember, removeMember };
};
