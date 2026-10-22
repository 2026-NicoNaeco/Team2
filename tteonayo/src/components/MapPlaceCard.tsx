import { useState } from 'react';
import type { Place } from '../types';
import type { PlaceCandidate } from '../services/placeSearch';

export type MapCardItem = Place | PlaceCandidate;

export interface MapCardState {
  key: string;
  lat: number;
  lng: number;
  // 카드 꼬리가 가리킬 위치: 핀 위(marker)인지 지도 클릭 지점(point)인지
  anchor: 'pin' | 'dot' | 'point';
  loading: boolean;
  error: string;
  items: MapCardItem[];
  index: number;
}

interface Props {
  card: MapCardState;
  savedOf: (item: MapCardItem) => Place | undefined;
  memo: (id: string) => string;
  onMemo: (id: string, text: string) => void;
  onSave: (item: MapCardItem) => void;
  onUnsave: (place: Place) => void;
  onSelectIndex: (index: number) => void;
  onManualAdd: () => void;
  onClose: () => void;
  // Leaflet 팝업 안에서는 팝업이 그림자·꼬리를 그리므로 생략한다.
  plain?: boolean;
}

const naverMapLink = (item: MapCardItem) =>
  `https://map.naver.com/p/search/${encodeURIComponent([item.name, item.address].filter(Boolean).join(' '))}`;

const labelOf = (item: MapCardItem) => ('categoryLabel' in item && item.categoryLabel) || item.category;

function MemoField({ id, initial, onSave }: { id: string; initial: string; onSave: (id: string, text: string) => void }) {
  const [open, setOpen] = useState(Boolean(initial));
  const [draft, setDraft] = useState(initial);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-2 border-none bg-transparent p-0 text-xs text-teal cursor-pointer">메모 추가</button>
    );
  }
  return (
    <textarea value={draft} onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onSave(id, draft.trim())} aria-label="장소 메모" placeholder="이 장소에 메모"
      maxLength={300} rows={2}
      className="mt-2 w-full resize-none rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none focus:border-teal" />
  );
}

export default function MapPlaceCard({
  card, savedOf, memo, onMemo, onSave, onUnsave, onSelectIndex, onManualAdd, onClose, plain,
}: Props) {
  const item = card.items[card.index];
  const saved = item ? savedOf(item) : undefined;
  const others = card.items.map((entry, index) => ({ entry, index })).filter(({ index }) => index !== card.index).slice(0, 4);

  return (
    <div className={plain ? 'relative w-[260px] text-ink' : 'relative'}>
      <div role="dialog" aria-label={item ? `${item.name} 장소 정보` : '선택한 위치'}
        className={plain ? '' : 'relative w-[min(280px,78vw)] rounded-xl border border-line bg-white px-4 py-3.5 text-ink shadow-[0_8px_24px_-8px_rgba(34,48,60,0.35)]'}>
        <button type="button" onClick={onClose} aria-label="장소 카드 닫기"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-none bg-transparent text-muted hover:bg-paper cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>

        {card.loading && <p role="status" className="m-0 pr-6 text-sm text-ink-soft">이 위치의 장소를 찾는 중…</p>}

        {!card.loading && !item && (
          <div className="pr-6">
            <p className="m-0 text-sm text-ink">{card.error || '이 위치에서 장소를 찾지 못했어요.'}</p>
            <button type="button" onClick={onManualAdd}
              className="mt-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs text-teal-deep cursor-pointer">여기에 직접 추가</button>
          </div>
        )}

        {!card.loading && item && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-1.5 pr-7">
              <strong className="text-[length:calc(15px*var(--font-scale))] leading-snug text-teal-deep">{saved?.name ?? item.name}</strong>
              <span className="text-xs text-muted">{labelOf(item)}</span>
            </div>
            {item.address && <p className="m-0 mt-1 text-[length:calc(13px*var(--font-scale))] leading-snug text-ink-soft">{item.address}</p>}
            <div className="mt-3 flex items-center gap-2">
              {saved ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-paper px-2.5 py-1.5 text-xs font-semibold text-teal-deep">
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    저장됨
                  </span>
                  <button type="button" onClick={() => onUnsave(saved)}
                    className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-pin cursor-pointer hover:bg-paper">저장 취소</button>
                </>
              ) : (
                <button type="button" onClick={() => onSave(item)}
                  className="rounded-lg border-none bg-teal-deep px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer hover:bg-teal">저장</button>
              )}
              <a href={naverMapLink(item)} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-xs text-muted underline-offset-2 hover:text-teal hover:underline">네이버 지도에서 보기</a>
            </div>
            {saved && <MemoField key={saved.id} id={saved.id} initial={memo(saved.id)} onSave={onMemo} />}
            {others.length > 0 && (
              <div className="mt-3 border-t border-line pt-2">
                <p className="m-0 mb-1 text-[length:calc(11px*var(--font-scale))] text-muted">이 근처 다른 장소</p>
                <div className="flex flex-col">
                  {others.map(({ entry, index }) => (
                    <button key={index} type="button" onClick={() => onSelectIndex(index)}
                      className="flex items-baseline gap-1.5 rounded-md border-none bg-transparent px-1 py-1 text-left cursor-pointer hover:bg-paper">
                      <span className="truncate text-xs font-semibold text-ink">{entry.name}</span>
                      <span className="shrink-0 text-[length:calc(11px*var(--font-scale))] text-muted">{labelOf(entry)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {!plain && (
        <span aria-hidden="true"
          className="absolute left-1/2 top-full -mt-[7px] h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-line bg-white" />
      )}
    </div>
  );
}
