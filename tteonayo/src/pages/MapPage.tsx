import 'leaflet/dist/leaflet.css';
import { useState, useMemo, useEffect, useRef, type FormEvent, type RefObject } from 'react';
import { CircleMarker, MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useSearchParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useTrip } from '../context/TripContext';
import type { Place } from '../types';
import { searchNearbyPlaces, searchPlacesByName, type PlaceCandidate } from '../services/placeSearch';

const SUNCHEON_CENTER: [number, number] = [34.9412, 127.4980];

const CATEGORY_COLOR: Record<Place['category'], string> = {
  카페: '#D64545',
  관광지: '#1D4A47',
  맛집: '#C77D30',
  숙소: '#2F6F6B',
};

const CATEGORIES: Place['category'][] = ['관광지', '카페', '맛집', '숙소'];

// 카테고리 색상만 사용하는 지도 핀.
const iconCache: Record<string, L.DivIcon> = {};
function iconFor(category: Place['category']) {
  const key = category;
  if (!iconCache[key]) {
    const color = CATEGORY_COLOR[category];
    iconCache[key] = L.divIcon({
      className: 'tteonayo-pin',
      html: `
        <div style="width:30px;height:30px;background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">
          <span style="width:8px;height:8px;border-radius:50%;background:#fff;transform:rotate(45deg);"></span>
        </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28],
    });
  }
  return iconCache[key];
}

// 선택된 장소로 지도를 부드럽게 이동하고 팝업을 연다
function MapController({
  target,
  markerRefs,
}: {
  target: Place | PlaceCandidate | null;
  markerRefs: RefObject<Record<string, L.Marker | null>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    if ('id' in target) markerRefs.current[target.id]?.openPopup();
  }, [target, map, markerRefs]);
  return null;
}

function MapCenterTracker({ onCenterChange }: { onCenterChange: (center: [number, number]) => void }) {
  useMapEvents({ moveend: (event) => {
    const center = event.target.getCenter();
    onCenterChange([center.lat, center.lng]);
  } });
  return null;
}

function MapClickPicker({ onPick }: { onPick: (position: [number, number]) => void }) {
  useMapEvents({ click: (event) => onPick([event.latlng.lat, event.latlng.lng]) });
  return null;
}

// 팝업 안 메모 입력 — 타이핑이 지도 전체를 리렌더하지 않도록 로컬 상태로 두고 blur 시 저장
function PlacePopup({ place }: { place: Place }) {
  const { memos, setMemo, renamePlace } = useTrip();
  const [draft, setDraft] = useState(memos[place.id] ?? '');
  const [editingName, setEditingName] = useState(false);

  return (
    <div className="w-[200px]">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: CATEGORY_COLOR[place.category] }}
        />
        {editingName ? (
          <input
            autoFocus
            defaultValue={place.name}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditingName(false);
            }}
            onBlur={(e) => {
              renamePlace(place.id, e.target.value);
              setEditingName(false);
            }}
            className="flex-1 min-w-0 text-[13px] font-semibold text-teal-deep border-b border-teal bg-transparent outline-none"
          />
        ) : (
          <strong className="text-[13px] text-teal-deep flex-1 min-w-0">{place.name}</strong>
        )}
        <button
          onClick={() => setEditingName((v) => !v)}
          className="shrink-0 text-[12px] text-[#B7AE97] hover:text-teal cursor-pointer"
          aria-label="장소 이름 수정"
        >
          수정
        </button>
      </div>
      <div className="text-[11px] text-[#8B8272] mb-2">
        {place.category}{place.tags.length > 0 ? ` · ${place.tags.join(', ')}` : ''}
      </div>
      {place.address && <p className="my-1 text-[11px] text-[#8B8272]">{place.address}</p>}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setMemo(place.id, draft.trim())}
        placeholder="이 장소에 메모 남기기..."
        className="w-full h-[54px] border border-line rounded-lg px-2 py-1.5 text-[12px] bg-paper outline-none resize-none focus:border-teal"
      />
    </div>
  );
}

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const placeIdParam = searchParams.get('placeId');
  const { places, addPlace, updatePlacePosition, renamePlace, removePlace, savedIds, memos } =
    useTrip();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Place | null>(null);
  const [focusedCandidate, setFocusedCandidate] = useState<PlaceCandidate | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>(SUNCHEON_CENTER);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftPosition, setDraftPosition] = useState<[number, number] | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCategory, setDraftCategory] = useState<Place['category']>('관광지');
  const [draftDescription, setDraftDescription] = useState('');
  const [addError, setAddError] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    searchNearbyPlaces(SUNCHEON_CENTER[0], SUNCHEON_CENTER[1], controller.signal)
      .then(setCandidates)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : '장소를 불러오지 못했습니다.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingCandidates(false); });
    return () => controller.abort();
  }, []);

  const refreshNearby = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadingCandidates(true);
    setSearchError('');
    setQuery('');
    try {
      setCandidates(await searchNearbyPlaces(mapCenter[0], mapCenter[1], controller.signal));
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : '장소를 불러오지 못했습니다.');
    } finally {
      if (!controller.signal.aborted) setLoadingCandidates(false);
    }
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loadingCandidates || !query.trim()) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadingCandidates(true);
    setSearchError('');
    try {
      const results = await searchPlacesByName(query, mapCenter[0], mapCenter[1], controller.signal);
      setCandidates(results);
      if (results.length === 0) setSearchError('현재 지도 주변 15km에서 일치하는 장소를 찾지 못했어요. 지도를 옮겨 다시 검색해 보세요.');
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : '장소를 찾지 못했습니다.');
    } finally {
      if (!controller.signal.aborted) setLoadingCandidates(false);
    }
  };

  useEffect(() => {
    if (!placeIdParam) return;
    const place = places.find((item) => item.id === placeIdParam);
    if (place) setSelected(place);
  }, [placeIdParam, places]);

  const savedPlaces = useMemo(() => places.filter((place) => savedIds.includes(place.id)), [places, savedIds]);
  const visibleSaved = useMemo(() => {
    const q = query.trim().toLowerCase();
    return savedPlaces.filter((p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [savedPlaces, query]);
  const visibleCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((place) =>
      (!q || place.name.toLowerCase().includes(q) || place.address?.toLowerCase().includes(q)) &&
      !savedPlaces.some((saved) => saved.source === place.source && saved.sourceId === place.sourceId)
    );
  }, [candidates, query, savedPlaces]);

  const saveCandidate = (candidate: PlaceCandidate) => {
    try {
      const place = addPlace({ ...candidate, description: '', tags: [] });
      setSelected(place);
      setFocusedCandidate(null);
      setSearchError('');
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : '장소를 저장하지 못했습니다.');
    }
  };

  const handleDragEnd = (id: string, marker: L.Marker) => {
    const { lat, lng } = marker.getLatLng();
    updatePlacePosition(id, lat, lng);
    setSelected((prev) => (prev && prev.id === id ? { ...prev, lat, lng } : prev));
  };

  const handleRemovePlace = (place: Place) => {
    if (!window.confirm(`'${place.name}' 장소를 지도와 목록에서 삭제할까요?`)) return;
    removePlace(place.id);
    setSelected((current) => current?.id === place.id ? null : current);
    setRenamingId((current) => current === place.id ? null : current);
    delete markerRefs.current[place.id];
  };

  const handleMapPick = (position: [number, number]) => {
    if (!manualMode) return;
    setDraftPosition(position);
    setSelected(null);
    setAddError('');
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
      setQuery('');
      setSelected(place);
      setDraftPosition(null);
      setDraftName('');
      setDraftDescription('');
      setManualMode(false);
      setAddError('');
    } catch (error) {
      setAddError(error instanceof Error ? error.message : '장소를 추가하지 못했습니다.');
    } finally {
      setSavingPlace(false);
    }
  };

  return (
    <>
      <Topbar title="스마트 여정 지도" stamp="장소 탐색과 기록" />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex h-[calc(100vh-160px)] min-h-[520px] border border-line rounded-2xl overflow-hidden">
          {/* 지도 (OpenStreetMap · Leaflet) */}
          <div className="flex-1 relative min-w-0">
            <MapContainer center={SUNCHEON_CENTER} zoom={14} scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {visibleCandidates.map((candidate) => (
                <Marker key={`${candidate.source}:${candidate.sourceId}`}
                  position={[candidate.lat, candidate.lng]}
                  icon={iconFor(candidate.category)}
                  eventHandlers={{ click: () => { setFocusedCandidate(candidate); setSelected(null); } }}>
                  <Popup>
                    <div className="w-[210px]">
                      <strong className="block text-sm text-teal-deep">{candidate.name}</strong>
                      <p className="my-1 text-xs text-muted">{candidate.address || '주소 정보 없음'} · {candidate.category}</p>
                      <button type="button" onClick={() => saveCandidate(candidate)}
                        className="rounded-lg border-none bg-teal-deep px-3 py-1.5 text-xs text-white cursor-pointer">내 장소에 저장</button>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {visibleSaved.map((place) => (
                <Marker
                  key={place.id}
                  position={[place.lat, place.lng]}
                  icon={iconFor(place.category)}
                  draggable
                  ref={(m) => {
                    markerRefs.current[place.id] = m;
                  }}
                  eventHandlers={{
                    click: () => setSelected(place),
                    dragend: (e) => handleDragEnd(place.id, e.target as L.Marker),
                  }}
                >
                  <Popup>
                    <PlacePopup place={place} />
                  </Popup>
                </Marker>
              ))}
              <MapClickPicker onPick={handleMapPick} />
              <MapCenterTracker onCenterChange={setMapCenter} />
              {draftPosition && <CircleMarker center={draftPosition} radius={8}
                pathOptions={{ color: '#1D4A47', fillColor: '#D64545', fillOpacity: 1, weight: 2 }}
                interactive={false} />}
              <MapController target={selected} markerRefs={markerRefs} />
              <MapController target={focusedCandidate} markerRefs={markerRefs} />
            </MapContainer>

            {/* 검색 */}
            <form onSubmit={handleSearch} className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex w-[min(380px,calc(100%-24px))] rounded-full bg-white/95 border border-line shadow-md overflow-hidden">
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                minLength={2} maxLength={80} placeholder="장소 이름 검색 (현재 지도 주변)"
                className="min-w-0 flex-1 bg-transparent px-4 py-2 text-xs outline-none" />
              <button type="submit" disabled={loadingCandidates || query.trim().length < 2}
                className="px-3 text-xs text-teal-deep bg-paper border-none cursor-pointer disabled:opacity-50">검색</button>
            </form>

            {/* 안내 토스트 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-teal-deep/95 text-paper rounded-full px-4 py-2 text-[11px] shadow-lg pointer-events-none">
              장소 핀을 눌러 저장하세요. 다른 지역은 지도를 옮긴 뒤 다시 검색하세요.
            </div>
          </div>

          {/* 지도에서 고른 좌표와 직접 저장한 장소 */}
          <div className="w-80 border-l border-line bg-white overflow-y-auto shrink-0">
            <div className="p-4 border-b border-line">
              <h3 className="m-0 text-sm font-display font-semibold text-teal-deep">장소 찾기</h3>
              <p className="m-0 mt-1 text-[11px] text-[#8B8272]">핀을 선택하고 장소 정보를 확인한 뒤 저장하세요.</p>
              <button type="button" onClick={refreshNearby} disabled={loadingCandidates}
                className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-teal-deep cursor-pointer disabled:opacity-50">
                {loadingCandidates ? '장소 불러오는 중…' : '현재 지도 주변 장소 찾기'}
              </button>
              {searchError && <p role="alert" className="mt-2 text-xs text-pin">{searchError}</p>}
              <button type="button" onClick={() => { setManualMode((value) => !value); setDraftPosition(null); }}
                className="mt-2 bg-transparent border-none p-0 text-xs text-teal cursor-pointer">
                {manualMode ? '직접 추가 취소' : '지도에 없는 장소 직접 추가'}
              </button>
              {manualMode && <p className="mt-1 mb-0 text-xs text-muted">지도에서 위치를 클릭하면 이름을 입력할 수 있어요.</p>}
            </div>

            <div className="px-4 pt-4 pb-1 text-xs text-muted font-semibold">주변 장소 ({visibleCandidates.length})</div>
            {loadingCandidates && <p className="px-4 text-xs text-muted">장소를 불러오는 중이에요.</p>}
            {!loadingCandidates && visibleCandidates.length === 0 &&
              <p className="px-4 text-xs text-muted">{query ? '일치하는 장소가 없어요.' : '이 지역에 표시할 장소가 없어요. 지도를 옮겨 다시 검색해 보세요.'}</p>}
            <div className="p-3 flex flex-col gap-2 max-h-64 overflow-y-auto border-b border-line">
              {visibleCandidates.map((candidate) => (
                <button key={`${candidate.source}:${candidate.sourceId}`} type="button"
                  onClick={() => { setFocusedCandidate(candidate); setSelected(null); }}
                  className="text-left rounded-xl bg-paper px-3 py-2.5 border border-transparent hover:border-teal cursor-pointer">
                  <span className="block text-xs font-semibold text-teal-deep">{candidate.name}</span>
                  <span className="block text-[11px] text-muted truncate">{candidate.address || candidate.category}</span>
                </button>
              ))}
            </div>
            {focusedCandidate && (
              <div className="m-3 rounded-xl border border-teal bg-paper p-3">
                <h4 className="m-0 text-sm text-teal-deep">{focusedCandidate.name}</h4>
                <p className="my-2 text-xs text-muted">{focusedCandidate.address || '주소 정보 없음'} · {focusedCandidate.category}</p>
                <button type="button" onClick={() => saveCandidate(focusedCandidate)}
                  className="rounded-lg border-none bg-teal-deep px-3 py-2 text-xs text-white cursor-pointer">내 장소에 저장</button>
              </div>
            )}

            {manualMode && draftPosition && (
              <form onSubmit={handleAddPlace} className="m-3 rounded-xl border border-teal bg-paper p-3 flex flex-col gap-2">
                <h4 className="m-0 text-sm font-semibold text-teal-deep">새 장소 저장</h4>
                <p className="m-0 text-[11px] text-muted">선택한 위치: {draftPosition[0].toFixed(5)}, {draftPosition[1].toFixed(5)}</p>
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
                    className="flex-1 rounded-lg border border-line bg-white py-2 text-xs text-ink-soft cursor-pointer">취소</button>
                  <button type="submit" disabled={!draftName.trim() || savingPlace}
                    className="flex-1 rounded-lg border-none bg-teal-deep py-2 text-xs text-white cursor-pointer disabled:opacity-50">
                    {savingPlace ? '저장 중' : '장소 저장'}
                  </button>
                </div>
              </form>
            )}

            <div className="px-4 pt-4 pb-1 text-xs tracking-wider uppercase text-[#8B8272] font-semibold">
              저장한 장소 ({visibleSaved.length})
            </div>
            {visibleSaved.length === 0 && (
              <p className="px-4 py-2 text-[12px] text-[#8B8272]">
                {query ? '검색 결과가 없어요.' : '아직 저장한 장소가 없어요. 주변 장소 핀을 눌러 저장해 보세요.'}
              </p>
            )}
            <div className="p-3 flex flex-col gap-2">
              {visibleSaved.map((place) => (
                <div
                  key={place.id}
                  className="bg-paper rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                >
                  <span className="w-1 h-8 rounded-full shrink-0" style={{ background: CATEGORY_COLOR[place.category] }} />
                  <div className="min-w-0 flex-1">
                    {renamingId === place.id ? (
                      <input
                        autoFocus
                        defaultValue={place.name}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={(e) => {
                          renamePlace(place.id, e.target.value);
                          setRenamingId(null);
                        }}
                        className="w-full text-[12.5px] font-semibold border-b border-teal bg-transparent outline-none"
                      />
                    ) : (
                      <div className="text-[12.5px] font-semibold truncate">{place.name}</div>
                    )}
                    <div className="text-[11px] text-[#8B8272] truncate">
                      {place.address || memos[place.id]?.trim() || place.description || place.category}
                    </div>
                  </div>
                  <button
                    onClick={() => setRenamingId((v) => (v === place.id ? null : place.id))}
                    className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-[#8B8272] hover:text-teal hover:bg-white cursor-pointer"
                    aria-label="이름 수정"
                  >
                    수정
                  </button>
                  <button type="button" onClick={() => handleRemovePlace(place)}
                    className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-pin hover:bg-white cursor-pointer"
                    aria-label={`${place.name} 삭제`}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
