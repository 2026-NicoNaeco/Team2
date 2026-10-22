import { useState } from 'react';
import { useTrip } from '../context/TripContext';
import type { BoardCard, TripPlace } from '../types';
import { placeTimes } from './boardDisplay';

const inputClass = 'w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink outline-teal';
const panelClass = 'fixed inset-x-3 bottom-3 z-[2000] max-h-[80dvh] overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-full sm:mt-1 sm:w-[260px] sm:-translate-x-1/2 print:hidden';

export function CardDateEditor({ item, card, onClose }: { item: TripPlace; card: BoardCard; onClose: () => void }) {
  const { tripMeta, tripPlaces, updateTripPlace, updateBoardCard } = useTrip();
  const [date, setDate] = useState(item.visitDate ?? '');
  const initialTimes = placeTimes(item, card);
  const [visitTime, setVisitTime] = useState(initialTimes.visitTime ?? '');
  const [reservationTime, setReservationTime] = useState(initialTimes.reservationTime ?? '');
  const [error, setError] = useState('');
  const save = () => {
    if (!date) { setError('방문 날짜를 선택해주세요.'); return; }
    if ((tripMeta.startDate && date < tripMeta.startDate) || (tripMeta.endDate && date > tripMeta.endDate)) {
      setError('여행 기간 안의 날짜를 선택해주세요.'); return;
    }
    const lastOrder = Math.max(0, ...tripPlaces.filter((entry) => entry.status === 'scheduled' && entry.visitDate === date && entry.id !== item.id)
      .map((entry) => entry.visitOrder ?? 0));
    updateTripPlace(item.id, { status: 'scheduled', visitDate: date,
      visitOrder: item.status === 'scheduled' && item.visitDate === date ? item.visitOrder ?? lastOrder + 1 : lastOrder + 1,
      visitTime: visitTime || undefined, reservationTime: reservationTime || undefined, timeMeaning: 'separate' });
    updateBoardCard(card.id, { time: undefined });
    onClose();
  };
  return <div role="dialog" aria-label={`${card.title} 방문 일정`} className={panelClass} data-no-drag
    onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <strong className="block mb-2 text-xs text-teal-deep">방문 일정</strong>
    <label className="block mb-2 text-xs text-ink-soft">날짜<input type="date" min={tripMeta.startDate} max={tripMeta.endDate} value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
    <label className="block mb-2 text-xs text-ink-soft">방문 예정 시간 (선택)<input type="time" value={visitTime} onChange={(event) => setVisitTime(event.target.value)} className={inputClass} /></label>
    <label className="block mb-2 text-xs text-ink-soft">예약 시간 (선택)<input type="time" value={reservationTime} onChange={(event) => setReservationTime(event.target.value)} className={inputClass} /></label>
    {error && <p role="alert" className="m-0 mb-2 text-xs text-pin">{error}</p>}
    <div className="flex justify-between gap-2">
      {item.status === 'scheduled' && <button type="button" onClick={() => { updateTripPlace(item.id, { status: 'candidate', visitOrder: undefined }); onClose(); }} className="text-xs text-teal bg-transparent border-none cursor-pointer">후보로 이동</button>}
      <div className="ml-auto flex gap-2"><button type="button" onClick={onClose} className="text-xs text-muted bg-transparent border-none cursor-pointer">취소</button><button type="button" onClick={save} className="rounded-lg border-none bg-teal-deep px-2.5 py-1.5 text-xs text-white cursor-pointer">일정에 추가</button></div>
    </div>
  </div>;
}

export function CardDetailEditor({ card, item, mode, onClose, onChoosePhoto, onRemovePhoto }: {
  card: BoardCard; item?: TripPlace; mode: 'full' | 'cost'; onClose: () => void;
  onChoosePhoto: () => void; onRemovePhoto: () => void;
}) {
  const { updateBoardCard, updateTripPlace } = useTrip();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [cost, setCost] = useState(item?.cost?.toString() ?? '');
  const [costBasis, setCostBasis] = useState<TripPlace['costBasis']>(item?.costBasis ?? 'group');
  const [reservationUrl, setReservationUrl] = useState(item?.reservationUrl ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const [error, setError] = useState('');
  const save = () => {
    if (mode === 'full' && !title.trim()) { setError('제목을 입력해주세요.'); return; }
    const amount = cost.trim() === '' ? null : Number(cost);
    if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 1000000000)) {
      setError('비용은 0~10억 원의 정수로 입력해주세요.'); return;
    }
    const url = reservationUrl.trim();
    if (url) {
      try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); }
      catch { setError('예약 링크는 http 또는 https 주소로 입력해주세요.'); return; }
    }
    if (mode === 'full') updateBoardCard(card.id, { title: title.trim(), description: description.trim() });
    if (item) updateTripPlace(item.id, { cost: amount, costBasis, ...(mode === 'full' ? { reservationUrl: url || undefined, note: note.trim() } : {}) });
    onClose();
  };
  return <div role="dialog" aria-label={`${card.title} ${mode === 'cost' ? '비용' : '수정'}`}
    className="fixed inset-x-2 bottom-2 z-[2000] max-h-[85dvh] overflow-y-auto rounded-xl border border-line bg-white p-4 shadow-2xl xl:static xl:inset-auto xl:z-auto xl:max-h-[calc(100dvh-180px)] xl:w-[280px] xl:shrink-0 xl:shadow-sm print:hidden" data-no-drag
    onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <div className="mb-3 flex items-center justify-between gap-2"><strong className="text-sm text-teal-deep">{mode === 'cost' ? '예상 비용' : `${card.title} 수정`}</strong><button type="button" onClick={onClose} className="border-none bg-transparent text-xs text-muted cursor-pointer">닫기</button></div>
    {mode === 'full' && <>
      <label className="block mb-2 text-xs text-ink-soft">제목<input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></label>
      <label className="block mb-2 text-xs text-ink-soft">카드 메모<textarea maxLength={10000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClass} resize-y`} /></label>
    </>}
    {item && <>
      <label className="block mb-2 text-xs text-ink-soft">금액 (원, 선택)<input type="number" min={0} max={1000000000} value={cost} onChange={(event) => setCost(event.target.value)} className={inputClass} /></label>
      <label className="block mb-2 text-xs text-ink-soft">비용 기준<select value={costBasis} onChange={(event) => setCostBasis(event.target.value as TripPlace['costBasis'])} className={inputClass}><option value="group">일행 전체</option><option value="per_person">1인당</option></select></label>
      {mode === 'full' && <>
        <label className="block mb-2 text-xs text-ink-soft">예약 링크 (선택)<input type="url" maxLength={1000} value={reservationUrl} onChange={(event) => setReservationUrl(event.target.value)} placeholder="https://" className={inputClass} /></label>
        <label className="block mb-2 text-xs text-ink-soft">장소 메모 (선택)<textarea maxLength={5000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} resize-y`} /></label>
      </>}
    </>}
    {mode === 'full' && <div className="mb-3 flex gap-2">
      <button type="button" onClick={onChoosePhoto} className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-teal-deep cursor-pointer">{card.imageUrl ? '사진 변경' : '사진 추가'}</button>
      {card.imageUrl && <button type="button" onClick={onRemovePhoto} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-pin cursor-pointer">사진 삭제</button>}
    </div>}
    {error && <p role="alert" className="m-0 mb-2 text-xs text-pin">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="text-xs text-muted border-none bg-transparent cursor-pointer">취소</button><button type="button" onClick={save} className="rounded-lg border-none bg-teal-deep px-2.5 py-1.5 text-xs text-white cursor-pointer">적용</button></div>
  </div>;
}
