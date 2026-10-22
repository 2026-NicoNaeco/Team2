import 'leaflet/dist/leaflet.css';
import { useState, useMemo, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { CircleMarker, MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useSearchParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import NaverPlaceMap, { type MapFocus } from '../components/NaverPlaceMap';
import { PIN_COLOR } from '../components/mapPinColors';
import MapPlaceCard, { type MapCardItem, type MapCardState } from '../components/MapPlaceCard';
import MapSearchBox from '../components/MapSearchBox';
import { useTrip } from '../context/TripContext';
import type { Place } from '../types';
import { searchNearbyPlaces, searchPlacesByName, searchPlacesAtPoint, type PlaceCandidate } from '../services/placeSearch';

const SUNCHEON_CENTER: [number, number] = [34.9412, 127.4980];
const NAVER_MAPS_CLIENT_ID = import.meta.env.VITE_NAVER_MAPS_CLIENT_ID?.trim();
const CATEGORIES: Place['category'][] = ['관광지', '카페', '맛집', '숙소'];

// Leaflet 대체 지도의 핀. 네이버 지도와 같은 모양(저장 장소=물방울 핀, 검색 결과=번호 원)을 쓴다.
const iconCache: Record<string, L.DivIcon> = {};
function savedIcon(category: Place['category']) {
  const key = `saved:${category}`;
  if (!iconCache[key]) {
    iconCache[key] = L.divIcon({
      className: 'tteonayo-pin',
      html: `<div style="width:30px;height:30px;background:${PIN_COLOR[category]};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="width:8px;height:8px;border-radius:50%;background:#fff;transform:rotate(45deg)"></span></div>`,
      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
    });
  }
  return iconCache[key];
}
function candidateIcon(category: Place['category'], label: number) {
  const key = `candidate:${category}:${label}`;
  if (!iconCache[key]) {
    const color = PIN_COLOR[category];
    iconCache[key] = L.divIcon({
      className: 'tteonayo-pin',
      html: `<div style="width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,.3);color:${color};font:700 12px/20px Pretendard,sans-serif;text-align:center">${label}</div>`,
      iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -10],
    });
  }
  return iconCache[key];
}

function LeafletFocus({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [focus, map]);
  return null;
}

function LeafletEvents({ onPick, onCenterChange }: {
  onPick: (position: [number, number]) => void;
  onCenterChange: (center: [number, number]) => void;
}) {
  useMapEvents({
    click: (event) => onPick([event.latlng.lat, event.latlng.lng]),
    moveend: (event) => {
      const center = event.target.getCenter();
      onCenterChange([center.lat, center.lng]);
    },
  });
  return null;
}

const keyOf = (item: MapCardItem) => ('id' in item ? item.id : `${item.source}:${item.sourceId}`);

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<span className="text-teal">{text.slice(at, at + q.length)}</span>{text.slice(at + q.length)}</>;
}

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const placeIdParam = searchParams.get('placeId');
  const { places, addPlace, updatePlacePosition, renamePlace, removePlace, savedIds, memos, setMemo } = useTrip();
  const [query, setQuery] = useState('');
  const [resultQuery, setResultQuery] = useState('');
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [resultKind, setResultKind] = useState<'none' | 'search' | 'nearby'>('none');
  const [tab, setTab] = useState<'search' | 'saved'>(() => (savedIds.length ? 'saved' : 'search'));
  const [mapCenter, setMapCenter] = useState<[number, number]>(SUNCHEON_CENTER);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [card, setCard] = useState<MapCardState | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftPosition, setDraftPosition] = useState<[number, number] | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCategory, setDraftCategory] = useState<Place['category']>('관광지');
  const [draftDescription, setDraftDescription] = useState('');
  const [addError, setAddError] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const pointRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    pointRequestRef.current?.abort();
  }, []);

  const savedPlaces = useMemo(() => places.filter((place) => savedIds.includes(place.id)), [places, savedIds]);
  const visibleCandidates = useMemo(() => candidates.filter((place) =>
    !savedPlaces.some((saved) => saved.source === place.source && saved.sourceId === place.sourceId)
  ), [candidates, savedPlaces]);
  const candidateNumber = (candidate: PlaceCandidate) => visibleCandidates.indexOf(candidate) + 1;

  const savedOf = (item: MapCardItem): Place | undefined => savedPlaces.find((saved) =>
    ('id' in item && saved.id === item.id) ||
    (item.sourceId !== undefined && saved.source === item.source && saved.sourceId === item.sourceId));

  const focusOn = (lat: number, lng: number, zoom?: number) => setFocus({ lat, lng, zoom, key: Date.now() });

  const openCard = (item: MapCardItem, anchor: MapCardState['anchor']) => {
    pointRequestRef.current?.abort();
    setCard({ key: keyOf(item), lat: item.lat, lng: item.lng, anchor, loading: false, error: '', items: [item], index: 0 });
  };

  const closeCard = (key?: string) => setCard((current) => (!key || current?.key === key ? null : current));

  useEffect(() => {
    if (!placeIdParam) return;
    const place = places.find((item) => item.id === placeIdParam);
    if (!place) return;
    setTab('saved');
    setCard({ key: place.id, lat: place.lat, lng: place.lng, anchor: 'pin', loading: false, error: '', items: [place], index: 0 });
    setFocus({ lat: place.lat, lng: place.lng, key: Date.now() });
    // 주소의 placeId로 처음 들어왔을 때만 연다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeIdParam]);

  const loadCandidates = async (kind: 'search' | 'nearby', keyword: string) => {
    pointRequestRef.current?.abort();
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setTab('search');
    setCard(null);
    setLoadingCandidates(true);
    setSearchError('');
    try {
      const results = kind === 'search'
        ? await searchPlacesByName(keyword, mapCenter[0], mapCenter[1], controller.signal)
        : await searchNearbyPlaces(mapCenter[0], mapCenter[1], controller.signal);
      setCandidates(results);
      setResultKind(kind);
      setResultQuery(kind === 'search' ? keyword : '');
      if (results.length === 0) {
        setSearchError(kind === 'search'
          ? '일치하는 장소를 찾지 못했어요. 지역명과 상호명을 함께 입력해 보세요.'
          : '이 주변에서 장소를 찾지 못했어요. 지도를 옮겨 다시 찾아보세요.');
      } else if (kind === 'search') {
        focusOn(results[0].lat, results[0].lng);
      }
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : '장소를 찾지 못했습니다.');
    } finally {
      if (!controller.signal.aborted) setLoadingCandidates(false);
    }
  };

  // 검색어를 모두 지우면 그 검색어로 찾은 결과와 지도 번호 핀도 함께 지운다. 저장한 장소는 그대로 둔다.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim() || resultKind !== 'search') return;
    requestRef.current?.abort();
    setLoadingCandidates(false);
    setCandidates([]);
    setResultKind('none');
    setResultQuery('');
    setSearchError('');
    setCard((current) => current?.items[current.index] && !savedOf(current.items[current.index]) ? null : current);
  };

  const pickSuggestion = (candidate: PlaceCandidate) => {
    setCandidates((current) => current.some((item) => keyOf(item) === keyOf(candidate)) ? current : [candidate, ...current]);
    setResultKind((kind) => (kind === 'none' ? 'search' : kind));
    setTab('search');
    focusOn(candidate.lat, candidate.lng);
    openCard(candidate, savedOf(candidate) ? 'pin' : 'dot');
  };

  const saveItem = (item: MapCardItem) => {
    try {
      const place = addPlace({
        name: item.name, category: item.category, lat: item.lat, lng: item.lng, address: item.address,
        source: item.source, sourceId: item.sourceId,
        description: 'description' in item ? item.description : '', tags: 'tags' in item ? item.tags : [],
      });
      // 저장 후에도 같은 카드에서 '저장됨'과 메모를 바로 보여준다.
      setCard((current) => current && {
        ...current, anchor: current.anchor === 'dot' ? 'pin' : current.anchor,
        items: current.items.map((entry, index) => (index === current.index ? place : entry)),
      });
      setSearchError('');
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : '장소를 저장하지 못했습니다.');
    }
  };

  const unsaveItem = (place: Place) => {
    if (memos[place.id]?.trim() && !window.confirm(`'${place.name}' 저장을 취소할까요? 이 장소의 메모도 함께 삭제돼요.`)) return;
    removePlace(place.id);
    setRenamingId((current) => (current === place.id ? null : current));
    // 검색 결과에서 온 장소는 카드에 남겨 다시 저장할 수 있게 하고, 직접 추가한 장소는 카드를 닫는다.
    if (!place.sourceId) closeCard(place.id);
  };

  const handleRemovePlace = (place: Place) => {
    if (!window.confirm(`'${place.name}' 장소를 지도와 목록에서 삭제할까요?`)) return;
    removePlace(place.id);
    setRenamingId((current) => (current === place.id ? null : current));
    setCard((current) => (current?.items[current.index] && savedOf(current.items[current.index])?.id === place.id ? null : current));
  };

  const handleMapPick = (position: [number, number]) => {
    if (manualMode) {
      setCard(null);
      setDraftPosition(position);
      setAddError('');
      return;
    }
    pointRequestRef.current?.abort();
    const controller = new AbortController();
    pointRequestRef.current = controller;
    const key = `point:${position[0].toFixed(6)}:${position[1].toFixed(6)}`;
    setCard({ key, lat: position[0], lng: position[1], anchor: 'point', loading: true, error: '', items: [], index: 0 });
    void searchPlacesAtPoint(position[0], position[1], controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return;
        // 이미 저장한 장소는 저장 상태가 보이도록 저장 데이터로 바꿔 보여준다.
        const items = results.map((item) => savedOf(item) ?? item);
        setCard((current) => current?.key === key ? {
          ...current, loading: false, items,
          ...(items[0] ? { lat: items[0].lat, lng: items[0].lng } : {}),
        } : current);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCard((current) => current?.key === key ? {
          ...current, loading: false, error: error instanceof Error ? error.message : '근처 장소를 찾지 못했어요.',
        } : current);
      });
  };

  const handleAddPlace = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftPosition || savingPlace) return;
    setSavingPlace(true);
    try {
      const place = addPlace({
        name: draftName, category: draftCategory, description: draftDescription,
        tags: [], lat: draftPosition[0], lng: draftPosition[1], source: 'manual',
      });
      setDraftPosition(null);
      setDraftName('');
      setDraftDescription('');
      setManualMode(false);
      setAddError('');
      setTab('saved');
      openCard(place, 'pin');
    } catch (error) {
      setAddError(error instanceof Error ? error.message : '장소를 추가하지 못했습니다.');
    } finally {
      setSavingPlace(false);
    }
  };

  const startManual = (position: [number, number] | null) => {
    setManualMode(true);
    setDraftPosition(position);
    setAddError('');
    setCard(null);
  };

  const activeKey = card?.items[card.index] ? keyOf(card.items[card.index]) : null;

  const cardContent = (plain: boolean) => card && (
    <MapPlaceCard key={card.key} card={card} plain={plain}
      savedOf={savedOf} memo={(id) => memos[id] ?? ''} onMemo={setMemo}
      onSave={saveItem} onUnsave={unsaveItem}
      onSelectIndex={(index) => setCard((current) => current && {
        ...current, index, lat: current.items[index].lat, lng: current.items[index].lng,
      })}
      onManualAdd={() => startManual([card.lat, card.lng])}
      onClose={() => closeCard()} />
  );

  return (
    <>
      <Topbar title="스마트 여정 지도" stamp="장소 탐색과 기록" />
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="flex h-[calc(100dvh-130px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-line md:h-[calc(100vh-150px)] md:flex-row">
          {/* 왼쪽 패널: 검색, 검색 결과, 저장한 장소 */}
          <aside className="relative z-20 flex max-h-[48%] shrink-0 flex-col border-b border-line bg-white md:max-h-none md:w-[360px] md:border-b-0 md:border-r">
            <div className="p-3 pb-2">
              <MapSearchBox value={query} onChange={handleQueryChange} busy={loadingCandidates}
                onSearch={(keyword) => { void loadCandidates('search', keyword); }}
                onPickPlace={pickSuggestion}
                onPickRegion={(lat, lng) => { setCard(null); focusOn(lat, lng, 13); }}
                onError={setSearchError} />
              <div className="mt-2 flex items-center gap-3 text-xs">
                <button type="button" onClick={() => { void loadCandidates('nearby', ''); }} disabled={loadingCandidates}
                  className="border-none bg-transparent p-0 text-teal-deep cursor-pointer disabled:opacity-50">
                  현재 지도 주변 장소
                </button>
                <span aria-hidden="true" className="text-line">|</span>
                <button type="button" onClick={() => {
                    if (!manualMode) return startManual(null);
                    setManualMode(false);
                    setDraftPosition(null);
                  }}
                  className="border-none bg-transparent p-0 text-teal-deep cursor-pointer">
                  {manualMode ? '직접 추가 취소' : '직접 추가'}
                </button>
              </div>
            </div>

            <div role="tablist" aria-label="장소 목록" className="flex border-b border-line px-3">
              {([['search', resultKind === 'nearby' ? '주변 장소' : '검색 결과', visibleCandidates.length], ['saved', '저장한 장소', savedPlaces.length]] as const)
                .map(([value, label, count]) => (
                  <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
                    className={`-mb-px flex-1 border-x-0 border-t-0 border-b-2 bg-transparent px-2 py-2.5 text-sm cursor-pointer ${tab === value
                      ? 'border-teal-deep font-semibold text-teal-deep' : 'border-transparent text-muted hover:text-ink'}`}>
                    {label} <span className="text-xs font-normal">{count}</span>
                  </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {searchError && <p role="alert" className="m-3 mb-0 text-xs text-pin">{searchError}</p>}

              {manualMode && (
                draftPosition ? (
                  <form onSubmit={handleAddPlace} className="m-3 flex flex-col gap-2 rounded-xl border border-teal bg-paper p-3">
                    <h4 className="m-0 text-sm font-semibold text-teal-deep">새 장소 저장</h4>
                    <label htmlFor="new-place-name" className="text-xs text-ink-soft">장소 이름</label>
                    <input id="new-place-name" autoFocus required maxLength={80} value={draftName}
                      onChange={(event) => setDraftName(event.target.value)} placeholder="예: 순천만 습지"
                      className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm outline-teal" />
                    <label htmlFor="new-place-category" className="text-xs text-ink-soft">분류</label>
                    <select id="new-place-category" value={draftCategory}
                      onChange={(event) => setDraftCategory(event.target.value as Place['category'])}
                      className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm outline-teal">
                      {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <label htmlFor="new-place-description" className="text-xs text-ink-soft">설명 (선택)</label>
                    <textarea id="new-place-description" value={draftDescription} maxLength={300} rows={3}
                      onChange={(event) => setDraftDescription(event.target.value)} placeholder="이 장소에 대한 메모"
                      className="resize-y rounded-lg border border-line bg-white px-2.5 py-2 text-sm outline-teal" />
                    {addError && <p role="alert" className="m-0 text-xs text-pin">{addError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setDraftPosition(null); setDraftName(''); setDraftDescription(''); setAddError(''); }}
                        className="flex-1 rounded-lg border border-line bg-white py-2 text-xs text-ink-soft cursor-pointer">위치 다시 선택</button>
                      <button type="submit" disabled={!draftName.trim() || savingPlace}
                        className="flex-1 rounded-lg border-none bg-teal-deep py-2 text-xs text-white cursor-pointer disabled:opacity-50">
                        {savingPlace ? '저장 중' : '장소 저장'}
                      </button>
                    </div>
                  </form>
                ) : <p className="m-3 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">지도에서 추가할 위치를 누르세요.</p>
              )}

              {tab === 'search' && (
                <>
                  {loadingCandidates && <p role="status" className="m-3 text-sm text-muted">장소를 찾는 중이에요.</p>}
                  {!loadingCandidates && resultKind === 'none' && (
                    <p className="m-3 text-sm leading-relaxed text-muted">장소나 지역을 검색하거나, 지도에서 장소 이름을 눌러 보세요.</p>
                  )}
                  {!loadingCandidates && visibleCandidates.length > 0 && (
                    <p className="m-0 px-4 pt-3 text-[length:calc(11px*var(--font-scale))] text-muted">
                      {visibleCandidates[0].source === 'naver' ? '네이버 지역 검색' : 'OpenStreetMap'} 결과
                      {resultKind === 'search' && resultQuery ? ` · ‘${resultQuery}’` : ''}
                    </p>
                  )}
                  <ol className="m-0 list-none p-0">
                    {visibleCandidates.map((candidate) => {
                      const key = keyOf(candidate);
                      return (
                        <li key={key} className="border-b border-line/60 last:border-b-0">
                          <button type="button"
                            onClick={() => { focusOn(candidate.lat, candidate.lng); openCard(candidate, 'dot'); }}
                            className={`flex w-full items-start gap-3 border-none px-4 py-3 text-left cursor-pointer hover:bg-paper ${activeKey === key ? 'bg-paper' : 'bg-white'}`}>
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-white text-[length:calc(11px*var(--font-scale))] font-bold"
                              style={{ borderColor: PIN_COLOR[candidate.category], color: PIN_COLOR[candidate.category] }}>
                              {candidateNumber(candidate)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-x-1.5">
                                <span className="text-sm font-semibold text-ink">{highlight(candidate.name, resultQuery)}</span>
                                <span className="text-xs text-muted">{candidate.categoryLabel ?? candidate.category}</span>
                              </span>
                              {candidate.address && <span className="mt-0.5 block text-[length:calc(13px*var(--font-scale))] text-ink-soft">{candidate.address}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}

              {tab === 'saved' && (
                <>
                  {savedPlaces.length === 0 && (
                    <p className="m-3 text-sm leading-relaxed text-muted">아직 저장한 장소가 없어요. 검색 결과나 지도의 장소 카드에서 저장할 수 있어요.</p>
                  )}
                  <ul className="m-0 list-none p-0">
                    {savedPlaces.map((place) => (
                      <li key={place.id} className={`flex items-center gap-2 border-b border-line/60 px-4 py-3 last:border-b-0 ${activeKey === place.id ? 'bg-paper' : ''}`}>
                        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: PIN_COLOR[place.category] }} />
                        {renamingId === place.id ? (
                          <input autoFocus defaultValue={place.name} aria-label="장소 이름"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                              if (event.key === 'Escape') setRenamingId(null);
                            }}
                            onBlur={(event) => { renamePlace(place.id, event.target.value); setRenamingId(null); }}
                            className="min-w-0 flex-1 border-b border-teal bg-transparent text-sm font-semibold outline-none" />
                        ) : (
                          <button type="button" onClick={() => { focusOn(place.lat, place.lng); openCard(place, 'pin'); }}
                            className="min-w-0 flex-1 border-none bg-transparent p-0 text-left cursor-pointer">
                            <span className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="text-sm font-semibold text-ink">{place.name}</span>
                              <span className="text-xs text-muted">{place.category}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-[length:calc(13px*var(--font-scale))] text-ink-soft">
                              {memos[place.id]?.trim() || place.address || place.description || '주소 정보 없음'}
                            </span>
                          </button>
                        )}
                        <button type="button" onClick={() => setRenamingId((value) => (value === place.id ? null : place.id))}
                          className="shrink-0 rounded-md border-none bg-transparent px-1.5 py-1 text-xs text-muted hover:bg-paper hover:text-teal cursor-pointer"
                          aria-label={`${place.name} 이름 수정`}>수정</button>
                        <button type="button" onClick={() => handleRemovePlace(place)}
                          className="shrink-0 rounded-md border-none bg-transparent px-1.5 py-1 text-xs text-pin hover:bg-paper cursor-pointer"
                          aria-label={`${place.name} 삭제`}>삭제</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </aside>

          {/* 지도. 네이버 지도 Client ID가 없으면 Leaflet/OpenStreetMap으로 동작한다. */}
          <div className="relative min-h-[260px] min-w-0 flex-1">
            {NAVER_MAPS_CLIENT_ID ? (
              <NaverPlaceMap
                clientId={NAVER_MAPS_CLIENT_ID}
                center={SUNCHEON_CENTER}
                candidates={visibleCandidates}
                savedPlaces={savedPlaces}
                draftPosition={draftPosition}
                focus={focus}
                card={card}
                cardContent={cardContent(false)}
                onCenterChange={setMapCenter}
                onPick={handleMapPick}
                onSelectSaved={(place) => openCard(place, 'pin')}
                onSelectCandidate={(candidate) => openCard(candidate, 'dot')}
                onDragSaved={(id, lat, lng) => updatePlacePosition(id, lat, lng)}
              />
            ) : (
              <MapContainer center={SUNCHEON_CENTER} zoom={14} scrollWheelZoom className="h-full w-full">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {visibleCandidates.map((candidate, index) => (
                  <Marker key={keyOf(candidate)} position={[candidate.lat, candidate.lng]}
                    icon={candidateIcon(candidate.category, index + 1)}
                    eventHandlers={{ click: () => openCard(candidate, 'dot') }} />
                ))}
                {savedPlaces.map((place) => (
                  <Marker key={place.id} position={[place.lat, place.lng]} icon={savedIcon(place.category)} draggable
                    eventHandlers={{
                      click: () => openCard(place, 'pin'),
                      dragend: (event) => {
                        const { lat, lng } = (event.target as L.Marker).getLatLng();
                        updatePlacePosition(place.id, lat, lng);
                      },
                    }} />
                ))}
                {card && (
                  <Popup key={`${card.key}:${card.index}`} position={[card.lat, card.lng]} closeButton={false}
                    offset={[0, card.anchor === 'pin' ? -28 : card.anchor === 'dot' ? -10 : 0]}
                    eventHandlers={{ remove: () => closeCard(card.key) }}>
                    {cardContent(true)}
                  </Popup>
                )}
                <LeafletEvents onPick={handleMapPick} onCenterChange={setMapCenter} />
                <LeafletFocus focus={focus} />
                {draftPosition && <CircleMarker center={draftPosition} radius={8}
                  pathOptions={{ color: '#1D4A47', fillColor: '#D64545', fillOpacity: 1, weight: 2 }}
                  interactive={false} />}
              </MapContainer>
            )}
            {manualMode && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-teal-deep/95 px-4 py-2 text-xs text-paper shadow-lg">
                추가할 위치를 지도에서 누르세요
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
