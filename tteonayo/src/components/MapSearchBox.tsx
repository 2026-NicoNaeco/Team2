import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { searchNaverPlaces, type PlaceCandidate } from '../services/placeSearch';
import { findDomesticRegions, searchDomesticRegions, type RegionOption } from '../services/domesticRegions';

type Suggestion =
  | { type: 'keyword'; text: string }
  | { type: 'region'; option: RegionOption }
  | { type: 'place'; place: PlaceCandidate };

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSearch: (keyword: string) => void;
  onPickPlace: (place: PlaceCandidate) => void;
  onPickRegion: (lat: number, lng: number) => void;
  onError: (message: string) => void;
  busy: boolean;
}

const KEYWORD_SUFFIXES = ['맛집', '카페', '관광지', '숙소'];

// 입력어와 겹치는 부분을 강조해 결과를 훑어보기 쉽게 한다.
function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<span className="text-teal">{text.slice(at, at + q.length)}</span>{text.slice(at + q.length)}</>;
}

async function locateRegion(option: RegionOption, signal: AbortSignal) {
  if (option.coordinates) return option.coordinates;
  const results = await searchDomesticRegions(option.area ?? option.name, signal);
  const match = results.find((item) => item.area === option.area || item.name.startsWith(option.name)) ?? results[0];
  if (!match?.coordinates) throw new Error('지역 위치를 찾지 못했어요.');
  return match.coordinates;
}

export default function MapSearchBox({ value, onChange, onSearch, onPickPlace, onPickRegion, onError, busy }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [places, setPlaces] = useState<{ query: string; items: PlaceCandidate[] }>({ query: '', items: [] });
  const regionRequest = useRef<AbortController | null>(null);
  const query = value.trim();

  // 입력이 멈춘 뒤에만 네이버 검색을 불러 호출 수를 줄인다. 키가 없으면 장소 제안은 생략한다.
  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchNaverPlaces(query, controller.signal)
        .then((items) => { if (!controller.signal.aborted) setPlaces({ query, items: items ?? [] }); })
        .catch(() => { if (!controller.signal.aborted) setPlaces({ query, items: [] }); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => () => regionRequest.current?.abort(), []);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!query) return [];
    const regions = findDomesticRegions(query).slice(0, 2);
    const exact = regions.find((option) => option.name === query || option.area === query);
    const keywords = exact ? KEYWORD_SUFFIXES.map((suffix) => ({ type: 'keyword' as const, text: `${exact.name} ${suffix}` })) : [];
    const placeItems = places.query === query ? places.items : [];
    return [
      ...keywords,
      ...regions.map((option) => ({ type: 'region' as const, option })),
      ...placeItems.map((place) => ({ type: 'place' as const, place })),
    ];
  }, [query, places]);

  const choose = (item: Suggestion) => {
    setOpen(false);
    setActive(-1);
    if (item.type === 'keyword') {
      onChange(item.text);
      onSearch(item.text);
    } else if (item.type === 'place') {
      onPickPlace(item.place);
    } else {
      regionRequest.current?.abort();
      const controller = new AbortController();
      regionRequest.current = controller;
      locateRegion(item.option, controller.signal)
        .then(({ lat, lng }) => onPickRegion(lat, lng))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) onError(error instanceof Error ? error.message : '지역 위치를 찾지 못했어요.');
        });
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (active >= 0 && suggestions[active]) return choose(suggestions[active]);
    if (query.length < 2 || busy) return;
    setOpen(false);
    onSearch(query);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (!suggestions.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    setOpen(true);
    setActive((index) => event.key === 'ArrowDown'
      ? (index + 1) % suggestions.length
      : (index <= 0 ? suggestions.length - 1 : index - 1));
  };

  const showList = open && suggestions.length > 0;

  return (
    <form onSubmit={submit} role="search" className="relative">
      <div className="flex items-center gap-2 rounded-xl border-2 border-teal bg-white px-3 focus-within:border-teal-deep">
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 text-teal">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input type="search" value={value} maxLength={80} placeholder="장소, 지역 검색"
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[length:calc(15px*var(--font-scale))] text-ink outline-none [&::-webkit-search-cancel-button]:hidden" />
        {value && (
          <button type="button" aria-label="검색어 지우기" onMouseDown={(event) => event.preventDefault()}
            onClick={() => { onChange(''); setActive(-1); }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-none bg-transparent text-muted hover:bg-paper cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        )}
        <button type="submit" disabled={busy || query.length < 2}
          className="shrink-0 rounded-lg border-none bg-teal-deep px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-40">
          {busy ? '검색 중' : '검색'}
        </button>
      </div>

      {showList && (
        <ul id={listId} role="listbox" aria-label="연관 검색어"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(420px,60vh)] list-none overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-lg">
          {suggestions.map((item, index) => (
            <li key={item.type === 'place' ? `p:${item.place.sourceId}` : item.type === 'region' ? `r:${item.option.name}:${item.option.area ?? ''}` : `k:${item.text}`}
              id={`${listId}-${index}`} role="option" aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 ${index === active ? 'bg-paper' : ''}`}>
              {item.type === 'place' ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="mt-1 shrink-0 text-muted">
                  <path d="M7 13s4.5-4.2 4.5-7.3A4.5 4.5 0 0 0 2.5 5.7C2.5 8.8 7 13 7 13z" fill="currentColor" /><circle cx="7" cy="5.7" r="1.6" fill="white" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" className="mt-1 shrink-0 text-muted">
                  <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              {item.type === 'keyword' && <span className="text-sm text-ink">{highlight(item.text, query)}</span>}
              {item.type === 'region' && (
                <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{highlight(item.option.area ?? item.option.name, query)}</span>
                  <span className="shrink-0 text-[length:calc(11px*var(--font-scale))] text-muted">지역으로 이동</span>
                </span>
              )}
              {item.type === 'place' && (
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-ink">{highlight(item.place.name, query)}</span>
                    <span className="shrink-0 text-[length:calc(11px*var(--font-scale))] text-muted">{item.place.categoryLabel ?? item.place.category}</span>
                  </span>
                  {item.place.address && <span className="block truncate text-xs text-muted">{item.place.address}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
