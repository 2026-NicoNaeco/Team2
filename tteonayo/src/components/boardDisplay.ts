import type { BoardCard, BoardConnection, TripPlace } from '../types';

export function dayLabel(date: string, startDate?: string) {
  const start = startDate ? Date.parse(`${startDate}T00:00:00Z`) : NaN;
  const current = Date.parse(`${date}T00:00:00Z`);
  const day = Number.isFinite(start) && Number.isFinite(current) && current >= start
    ? Math.floor((current - start) / 86400000) + 1 : null;
  return `${day ? `${day}일차 · ` : ''}${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

// 예전 '시간 (선택)' 입력은 reservationTime과 card.time에 함께 저장됐다.
// 당시에는 예약으로 안내하지 않았으므로 방문 예정 시간으로 표시한다.
export function placeTimes(item: TripPlace, card?: BoardCard) {
  if (item.timeMeaning === 'separate') {
    return { visitTime: item.visitTime, reservationTime: item.reservationTime };
  }
  return { visitTime: item.visitTime ?? item.reservationTime ?? card?.time, reservationTime: undefined };
}

export function primaryTime(item: TripPlace, card?: BoardCard) {
  const { visitTime, reservationTime } = placeTimes(item, card);
  return reservationTime ? `예약 ${reservationTime}` : visitTime ? `방문 예정 ${visitTime}` : '';
}

export function connectionNeedsReview(connection: BoardConnection, cards: BoardCard[], places: TripPlace[]) {
  const fromCard = cards.find((card) => card.id === connection.from);
  const toCard = cards.find((card) => card.id === connection.to);
  const from = places.find((item) => item.placeId === fromCard?.placeId);
  const to = places.find((item) => item.placeId === toCard?.placeId);
  if (from?.status !== 'scheduled' || to?.status !== 'scheduled' || !from.visitDate || !to.visitDate) return false;
  if (from.visitDate > to.visitDate) return true;
  return from.visitDate === to.visitDate && (to.visitOrder ?? 0) !== (from.visitOrder ?? 0) + 1;
}
