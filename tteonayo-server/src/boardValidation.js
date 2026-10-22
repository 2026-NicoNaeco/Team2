const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const id = (value) => text(value, 128) && value.length > 0;
const optional = (value, check) => value === undefined || value === null || check(value);
const list = (value, max, check) => Array.isArray(value) && value.length <= max && value.every(check);
const number = (value, max) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const day = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const time = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function url(value) {
  if (!text(value, 1000) || !value) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function card(value) {
  return object(value) && id(value.id) && text(value.day, 80) && text(value.title, 200) &&
    text(value.description, 10000) && number(value.top, 100000) && number(value.left, 100000) &&
    optional(value.kind, (item) => item === 'text') &&
    optional(value.textWidth, (item) => integer(item, 120, 800)) &&
    optional(value.textFontSize, (item) => integer(item, 12, 72)) &&
    optional(value.textBold, (item) => typeof item === 'boolean') &&
    optional(value.textAlign, (item) => ['left', 'center', 'right'].includes(item)) &&
    optional(value.placeId, id) && optional(value.address, (item) => text(item, 200)) &&
    optional(value.time, (item) => text(item, 100)) &&
    optional(value.imageUrl, (item) => text(item, 4000000));
}

function connection(value) {
  return object(value) && id(value.id) && id(value.from) && id(value.to) &&
    optional(value.label, (item) => text(item, 200)) &&
    optional(value.transportMode, (item) => ['walk', 'transit', 'car', 'other'].includes(item)) &&
    optional(value.durationMinutes, (item) => integer(item, 0, 10080)) &&
    optional(value.description, (item) => text(item, 200)) &&
    optional(value.durationSource, (item) => ['manual', 'route_api'].includes(item));
}

function tripPlace(value) {
  if (!object(value) || !id(value.id) || !id(value.placeId) ||
      !['candidate', 'scheduled', 'unassigned'].includes(value.status) ||
      !object(value.snapshot) || !text(value.snapshot.name, 80) || !value.snapshot.name.trim() ||
      !optional(value.snapshot.address, (item) => text(item, 200)) ||
      !optional(value.snapshot.lat, (item) => number(item, 90)) ||
      !optional(value.snapshot.lng, (item) => number(item, 180)) ||
      !optional(value.origin, (item) => ['saved', 'ai'].includes(item)) ||
      !optional(value.visitDate, day) ||
      !optional(value.visitOrder, (item) => integer(item, 0, 500)) ||
      !optional(value.visitTime, time) ||
      !optional(value.timeMeaning, (item) => item === 'separate') ||
      !optional(value.reservationTime, time) ||
      !optional(value.reservationUrl, url) ||
      !optional(value.note, (item) => text(item, 5000)) ||
      !optional(value.cost, (item) => integer(item, 0, 1000000000)) ||
      !optional(value.costBasis, (item) => ['per_person', 'group'].includes(item)) ||
      !optional(value.stayMinutes, (item) => integer(item, 0, 10080))) return false;
  return value.status !== 'scheduled' || Boolean(value.visitDate && integer(value.visitOrder, 1, 500));
}

function tripMeta(value) {
  return object(value) && text(value.region || '', 80) &&
    optional(value.startDate, day) && optional(value.endDate, day) &&
    integer(value.partySize, 1, 50) &&
    optional(value.totalBudget, (item) => integer(item, 0, 1000000000)) &&
    (!value.startDate || !value.endDate || value.startDate <= value.endDate);
}

function validBoardData(value) {
  if (!object(value) || value.schemaVersion !== 1 ||
      !list(value.cards, 500, card) || !list(value.connections, 1000, connection) ||
      !optional(value.tripMeta, tripMeta) || !optional(value.tripPlaces, (items) => list(items, 500, tripPlace))) return false;
  const allowed = new Set(['schemaVersion', 'cards', 'connections', 'tripMeta', 'tripPlaces']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  const cardIds = new Set(value.cards.map((item) => item.id));
  if (cardIds.size !== value.cards.length || new Set(value.connections.map((item) => item.id)).size !== value.connections.length) return false;
  if (value.connections.some((item) => !cardIds.has(item.from) || !cardIds.has(item.to) || item.from === item.to)) return false;
  if (value.tripPlaces) {
    if (new Set(value.tripPlaces.map((item) => item.id)).size !== value.tripPlaces.length) return false;
    const orders = new Set();
    for (const item of value.tripPlaces) {
      if (item.status !== 'scheduled') continue;
      if (value.tripMeta?.startDate && item.visitDate < value.tripMeta.startDate) return false;
      if (value.tripMeta?.endDate && item.visitDate > value.tripMeta.endDate) return false;
      const key = `${item.visitDate}:${item.visitOrder}`;
      if (orders.has(key)) return false;
      orders.add(key);
    }
  }
  return true;
}

function validTitle(value) {
  return text(value, 80) && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
}

module.exports = { validBoardData, validTitle };
