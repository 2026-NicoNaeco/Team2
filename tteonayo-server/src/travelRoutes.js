const express = require('express');
const store = require('./store');

const router = express.Router();
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 10000) => typeof value === 'string' && value.length <= max;
const id = (value) => text(value, 128) && value.length > 0;
const list = (value, max, check) => Array.isArray(value) && value.length <= max && value.every(check);
const coordinate = (value, max) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const optional = (value, check) => value === undefined || value === null || check(value);
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const httpUrl = (value) => {
  if (!text(value, 1000) || !value) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};

function validPlace(place) {
  return object(place) && id(place.id) && text(place.name, 80) && place.name.trim().length > 0 &&
    ['카페', '관광지', '맛집', '숙소'].includes(place.category) &&
    text(place.description, 5000) && list(place.tags, 10, (tag) => text(tag, 40)) &&
    coordinate(place.lat, 90) && coordinate(place.lng, 180) &&
    optional(place.address, (value) => text(value, 200)) &&
    optional(place.source, (value) => ['openstreetmap', 'kakao', 'naver', 'manual'].includes(value)) &&
    optional(place.sourceId, id);
}

function validCard(card) {
  return object(card) && id(card.id) && text(card.day, 80) && text(card.title, 200) &&
    text(card.description, 10000) && coordinate(card.top, 100000) && coordinate(card.left, 100000) &&
    optional(card.kind, (value) => value === 'text') &&
    optional(card.textWidth, (value) => Number.isInteger(value) && value >= 120 && value <= 800) &&
    optional(card.textFontSize, (value) => Number.isInteger(value) && value >= 12 && value <= 72) &&
    optional(card.textBold, (value) => typeof value === 'boolean') &&
    optional(card.textAlign, (value) => ['left', 'center', 'right'].includes(value)) &&
    optional(card.placeId, id) && optional(card.address, (value) => text(value, 200)) &&
    optional(card.time, (value) => text(value, 100)) &&
    optional(card.imageUrl, (value) => text(value, 4000000));
}

function validConnection(connection) {
  return object(connection) && id(connection.id) && id(connection.from) && id(connection.to) &&
    optional(connection.label, (value) => text(value, 200)) &&
    optional(connection.transportMode, (value) => ['walk', 'transit', 'car', 'other'].includes(value)) &&
    optional(connection.durationMinutes, (value) => Number.isInteger(value) && value >= 0 && value <= 10080) &&
    optional(connection.description, (value) => text(value, 200)) &&
    optional(connection.durationSource, (value) => ['manual', 'route_api'].includes(value));
}

function validTripPlace(item) {
  if (!object(item) || !id(item.id) || !id(item.placeId) ||
      !['candidate', 'scheduled', 'unassigned'].includes(item.status) ||
      !object(item.snapshot) || !text(item.snapshot.name, 80) || !item.snapshot.name.trim() ||
      !optional(item.snapshot.address, (value) => text(value, 200)) ||
      !optional(item.snapshot.lat, (value) => coordinate(value, 90)) ||
      !optional(item.snapshot.lng, (value) => coordinate(value, 180)) ||
      !optional(item.origin, (value) => ['saved', 'ai'].includes(value)) ||
      !optional(item.visitDate, date) ||
      !optional(item.visitOrder, (value) => Number.isInteger(value) && value >= 0) ||
      !optional(item.visitTime, (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
      !optional(item.timeMeaning, (value) => value === 'separate') ||
      !optional(item.reservationTime, (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
      !optional(item.reservationUrl, httpUrl) ||
      !optional(item.note, (value) => text(value, 5000)) ||
      !optional(item.cost, (value) => Number.isInteger(value) && value >= 0 && value <= 1000000000) ||
      !optional(item.costBasis, (value) => ['per_person', 'group'].includes(value)) ||
      !optional(item.stayMinutes, (value) => Number.isInteger(value) && value >= 0 && value <= 10080)) return false;
  return item.status !== 'scheduled' || Boolean(item.visitDate && Number.isInteger(item.visitOrder) && item.visitOrder >= 1 && item.visitOrder <= 500);
}

function validTripPlaces(value) {
  if (!list(value, 500, validTripPlace)) return false;
  const orders = new Set();
  for (const item of value) {
    if (item.status !== 'scheduled') continue;
    const key = `${item.visitDate}:${item.visitOrder}`;
    if (orders.has(key)) return false;
    orders.add(key);
  }
  return true;
}

function validTripMeta(meta) {
  return object(meta) && text(meta.region || '', 80) &&
    optional(meta.startDate, date) &&
    optional(meta.endDate, date) &&
    Number.isInteger(meta.partySize) && meta.partySize >= 1 && meta.partySize <= 50 &&
    optional(meta.totalBudget, (value) => Number.isInteger(value) && value >= 0 && value <= 1000000000) &&
    (!meta.startDate || !meta.endDate || meta.startDate <= meta.endDate);
}

function validTripDates(meta, tripPlaces) {
  if (!meta || !tripPlaces) return true;
  return tripPlaces.every((item) => item.status !== 'scheduled' ||
    (!meta.startDate || item.visitDate >= meta.startDate) &&
    (!meta.endDate || item.visitDate <= meta.endDate));
}

function validBoard(board) {
  return object(board) && id(board.id) && text(board.title, 80) && board.title.trim().length > 0 &&
    list(board.cards, 500, validCard) && list(board.connections, 1000, validConnection) &&
    text(board.createdAt, 50) && text(board.updatedAt, 50) &&
    optional(board.tripMeta, validTripMeta) &&
    optional(board.tripPlaces, validTripPlaces) &&
    validTripDates(board.tripMeta, board.tripPlaces);
}

function stringRecord(value, maxItems, maxValue) {
  return object(value) && Object.keys(value).length <= maxItems &&
    Object.entries(value).every(([key, item]) => id(key) && text(item, maxValue));
}

function validState(data) {
  return object(data) &&
    optional(data.positions, (value) => object(value) && Object.keys(value).length <= 5000 &&
      Object.entries(value).every(([key, position]) => id(key) && object(position) && coordinate(position.lat, 90) && coordinate(position.lng, 180))) &&
    optional(data.names, (value) => stringRecord(value, 5000, 80)) &&
    optional(data.customPlaces, (value) => list(value, 5000, validPlace)) &&
    optional(data.deletedPlaceIds, (value) => list(value, 5000, id)) &&
    optional(data.savedIds, (value) => list(value, 5000, id)) &&
    optional(data.memos, (value) => stringRecord(value, 5000, 10000)) &&
    optional(data.boardCards, (value) => list(value, 500, validCard)) &&
    optional(data.connections, (value) => list(value, 1000, validConnection)) &&
    optional(data.savedBoards, (value) => list(value, 500, validBoard)) &&
    optional(data.activeBoardId, id) &&
    optional(data.activeTripMeta, validTripMeta) &&
    optional(data.activeTripPlaces, validTripPlaces) &&
    validTripDates(data.activeTripMeta, data.activeTripPlaces) &&
    optional(data.diaryFolders, (value) => list(value, 100, (folder) => object(folder) && id(folder.id) && text(folder.name, 80))) &&
    optional(data.diaryNotes, (value) => list(value, 500, (note) => object(note) && id(note.id) && id(note.folderId) && text(note.title, 200) && text(note.content, 10000) && text(note.updatedAt, 50))) &&
    optional(data.chatConversations, (value) => list(value, 200, (chat) => object(chat) && id(chat.id) && text(chat.region, 80) && text(chat.title, 120) &&
      list(chat.messages, 1000, (message) => object(message) && id(message.id) && ['ai', 'user'].includes(message.sender) && text(message.text, 10000) &&
        optional(message.sources, (sources) => list(sources, 5, (source) => object(source) && text(source.title, 200) && httpUrl(source.url)))) &&
      text(chat.createdAt, 50) && text(chat.updatedAt, 50)));
}

router.use(async (req, res, next) => {
  if (!await store.getUserById(req.user.id)) return res.status(401).json({ error: '사용자를 찾을 수 없어요.' });
  next();
});

router.get('/state', async (req, res) => {
  const row = await store.getTravelState(req.user.id);
  res.json({ version: row?.version ?? 0, data: row?.data ?? null });
});

router.post('/import', async (req, res) => {
  const { importId, data } = req.body ?? {};
  if (!id(importId) || !validState(data)) return res.status(400).json({ error: '가져올 여행 데이터가 올바르지 않아요.' });
  const result = await store.importTravelState(req.user.id, importId, data);
  if (result.status === 'conflict') {
    return res.status(409).json({ error: '서버에 다른 여행 데이터가 있어 자동으로 합칠 수 없어요. 이 브라우저의 원본은 보존됩니다.' });
  }
  const created = result.status === 'created';
  res.status(created ? 201 : 200).json({ version: result.row.version, data: result.row.data, imported: created });
});

router.put('/state', async (req, res) => {
  const { version, data } = req.body ?? {};
  if (!Number.isInteger(version) || version < 0 || !validState(data)) {
    return res.status(400).json({ error: '저장할 여행 데이터가 올바르지 않아요.' });
  }
  const result = await store.saveTravelState(req.user.id, version, data);
  if (result.status === 'conflict') return res.status(409).json({ error: '다른 기기에서 여행 데이터가 변경됐어요. 현재 내용을 보존하고 다시 확인해주세요.' });
  if (result.status === 'legacy_conflict') return res.status(409).json({ error: '이전 형식 일정판은 읽기 전용으로 보관 중이에요. 새 일정판 API를 사용하거나 관리자에게 데이터 이전을 요청해 주세요.' });
  res.json({ version: result.row.version, data: result.row.data });
});

module.exports = router;
