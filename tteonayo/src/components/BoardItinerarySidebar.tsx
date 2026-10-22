import { useTrip } from '../context/TripContext';
import { dayLabel, placeTimes } from './boardDisplay';

interface Props {
  dates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onFocusCard: (placeId: string) => void;
  onAddPlace: () => void;
  editable: boolean;
  mobileBoardButton?: () => void;
}

export default function BoardItinerarySidebar({ dates, selectedDate, onSelectDate, onFocusCard, onAddPlace, editable, mobileBoardButton }: Props) {
  const { tripPlaces, tripMeta, boardCards, reorderTripPlaces } = useTrip();
  const items = tripPlaces.filter((item) => item.status === 'scheduled' && item.visitDate === selectedDate)
    .sort((a, b) => (a.visitOrder ?? 0) - (b.visitOrder ?? 0));
  // 카드와 같은 형식으로 방문·예약 시간을 모두 보여준다.
  const timeText = (item: (typeof items)[number]) => {
    const { visitTime, reservationTime } = placeTimes(item, boardCards.find((card) => card.placeId === item.placeId));
    return [visitTime ? `방문 ${visitTime}` : '', reservationTime ? `예약 ${reservationTime}` : ''].filter(Boolean).join(' · ');
  };
  const move = (sourceId: string, targetId: string) => {
    if (editable && selectedDate && sourceId !== targetId) reorderTripPlaces(selectedDate, sourceId, targetId);
  };

  return <aside aria-label="날짜별 일정" className="w-full shrink-0 rounded-2xl border border-line bg-white p-3 xl:w-[clamp(240px,21vw,280px)] print:hidden">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="m-0 font-display text-sm font-semibold text-teal-deep">날짜별 일정</h2>
      {mobileBoardButton && <button type="button" onClick={mobileBoardButton} className="xl:hidden rounded-lg border border-line bg-paper px-2 py-1 text-xs text-teal-deep">화이트보드 보기</button>}
    </div>
    {dates.length > 0 ? <div role="tablist" aria-label="여행 날짜" className="mb-3 flex gap-1 overflow-x-auto pb-1 xl:flex-wrap">
      {dates.map((date) => <button key={date} type="button" role="tab" aria-selected={selectedDate === date} onClick={() => onSelectDate(date)}
        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${selectedDate === date ? 'border border-teal-deep bg-teal-deep text-white' : 'border border-line bg-paper text-teal-deep'}`}>{dayLabel(date, tripMeta.startDate)}</button>)}
    </div> : <p className="my-2 text-xs text-muted">여행 설정에서 날짜를 정하면 날짜별로 계획을 볼 수 있어요.</p>}
    {selectedDate && <div className="mb-2 text-sm font-semibold text-ink">{dayLabel(selectedDate, tripMeta.startDate)} <span className="text-xs font-normal text-muted">· 장소 {items.length}곳</span></div>}
    {items.length > 0 ? <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item, index) => <li key={item.id} draggable={editable}
        onDragStart={(event) => { if (editable) { event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; } }}
        onDragOver={(event) => { if (editable) event.preventDefault(); }}
        onDrop={(event) => { if (editable) { event.preventDefault(); move(event.dataTransfer.getData('text/plain'), item.id); } }}
        className="flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-2 hover:border-teal">
        {editable && <span aria-hidden="true" className="text-xs text-muted cursor-grab">⋮⋮</span>}
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-deep text-xs font-bold text-white">{index + 1}</span>
        <button type="button" onClick={() => onFocusCard(item.placeId)} className="min-w-0 flex-1 border-none bg-transparent p-0 text-left cursor-pointer">
          <span className="sr-only">{index + 1}번째 방문 </span>
          <span className="block break-words text-sm font-semibold leading-snug text-ink">{item.snapshot.name}</span>
          {timeText(item) && <span className="block text-xs text-teal-deep">{timeText(item)}</span>}
        </button>
        {editable && <div className="flex shrink-0 flex-col">
          <button type="button" disabled={index === 0} onClick={() => move(item.id, items[index - 1].id)} aria-label={`${item.snapshot.name} 위로`} className="h-6 w-6 rounded border-none bg-transparent text-sm text-teal-deep cursor-pointer hover:bg-paper disabled:cursor-default disabled:opacity-25">↑</button>
          <button type="button" disabled={index === items.length - 1} onClick={() => move(item.id, items[index + 1].id)} aria-label={`${item.snapshot.name} 아래로`} className="h-6 w-6 rounded border-none bg-transparent text-sm text-teal-deep cursor-pointer hover:bg-paper disabled:cursor-default disabled:opacity-25">↓</button>
        </div>}
      </li>)}</ol> : selectedDate ? <p className="my-3 text-xs text-muted">이 날짜에 추가한 장소가 없습니다.</p> : null}
    {editable && <button type="button" onClick={onAddPlace} className="mt-3 w-full rounded-lg border border-dashed border-line bg-white px-2 py-2 text-xs text-teal-deep cursor-pointer">장소 추가</button>}
  </aside>;
}
