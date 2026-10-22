const store = require('./store');
const { validBoardData, validTitle } = require('./boardValidation');

const uuid = (value) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

class BoardError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const missing = () => new BoardError(404, '일정판을 찾을 수 없어요.');
const forbidden = () => new BoardError(403, '이 일정판을 수정할 권한이 없어요.');

async function accessible(boardId, userId) {
  if (!uuid(boardId)) throw missing();
  const result = await store.boards.get(boardId, userId);
  if (!result) throw missing();
  return result;
}

async function list(userId) {
  return store.boards.list(userId);
}

async function get(boardId, userId) {
  const result = await accessible(boardId, userId);
  return { ...result.board, role: result.role, members: result.members };
}

async function create(userId, payload) {
  if (!validTitle(payload?.title) || !validBoardData(payload?.data)) {
    throw new BoardError(400, '일정판 제목이나 데이터가 올바르지 않아요.');
  }
  const board = await store.boards.create(userId, payload.title.trim(), payload.data);
  return get(board.id, userId);
}

async function update(boardId, userId, payload) {
  const current = await accessible(boardId, userId);
  if (current.role === 'viewer') throw forbidden();
  if (!Number.isInteger(payload?.expectedVersion) || payload.expectedVersion < 1 ||
      !validTitle(payload.title) || !validBoardData(payload.data)) {
    throw new BoardError(400, '일정판 제목, 버전 또는 데이터가 올바르지 않아요.');
  }
  const result = await store.boards.update(boardId, payload.expectedVersion, payload.title.trim(), payload.data);
  if (result.status === 'missing') throw missing();
  if (result.status === 'conflict') throw new BoardError(409, '다른 곳에서 일정판이 변경됐어요. 다시 불러온 뒤 확인해 주세요.');
  return get(boardId, userId);
}

async function remove(boardId, userId) {
  const current = await accessible(boardId, userId);
  if (current.role !== 'owner') throw forbidden();
  if (!await store.boards.remove(boardId)) throw missing();
}

// Stage A internal service only. The later invitation API will call this path.
async function addMember(boardId, actorId, userId, role) {
  const current = await accessible(boardId, actorId);
  if (current.role !== 'owner') throw forbidden();
  if (!Number.isInteger(userId) || userId < 1 || !['editor', 'viewer'].includes(role)) {
    throw new BoardError(400, '참여자 정보가 올바르지 않아요.');
  }
  const result = await store.boards.addMember(boardId, actorId, userId, role);
  if (result.status === 'missing') throw missing();
  if (result.status === 'forbidden') throw forbidden();
  if (result.status === 'user_missing') throw new BoardError(404, '사용자를 찾을 수 없어요.');
  if (result.status === 'existing') throw new BoardError(409, '이미 참여 중인 사용자예요.');
  if (result.status === 'full') throw new BoardError(409, '일정판 참여자는 소유자 포함 최대 4명이에요.');
  return get(boardId, actorId);
}

async function addMemberByEmail(boardId, actorId, email) {
  const current = await accessible(boardId, actorId);
  if (current.role !== 'owner') throw forbidden();
  if (typeof email !== 'string' || !email.trim() || email.length > 254) {
    throw new BoardError(400, '추가할 수 없어요.');
  }
  const user = await store.getUserByEmail(email.trim());
  if (!user) throw new BoardError(409, '추가할 수 없어요.');
  try {
    await addMember(boardId, actorId, user.id, 'editor');
  } catch (error) {
    if (error instanceof BoardError && error.status === 409) {
      throw new BoardError(409, '추가할 수 없어요.');
    }
    throw error;
  }
  return get(boardId, actorId);
}

async function removeMember(boardId, actorId, userId) {
  if (!Number.isInteger(userId) || userId < 1) throw new BoardError(400, '참여자 정보가 올바르지 않아요.');
  const result = await store.boards.removeMember(boardId, actorId, userId);
  if (result.status === 'missing' || result.status === 'member_missing') throw missing();
  if (result.status === 'forbidden' || result.status === 'owner_protected') throw forbidden();
}

module.exports = { BoardError, list, get, create, update, remove, addMember, addMemberByEmail, removeMember };
