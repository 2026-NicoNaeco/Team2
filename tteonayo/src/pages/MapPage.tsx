import 'leaflet/dist/leaflet.css';
import { useState, useMemo, useEffect, useRef, type RefObject } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import Topbar from '../components/Topbar';
import { useTrip } from '../context/TripContext';
import type { Place } from '../types';

const SUNCHEON_CENTER: [number, number] = [34.9330, 127.4940];

const CATEGORY_COLOR: Record<Place['category'], string> = {
  카페: '#D64545',
  관광지: '#1D4A47',
  맛집: '#C77D30',
  숙소: '#2F6F6B',
};

const FILTERS = [
  { label: '전체 보기', value: null },
  { label: '☕ 카페', value: '카페' },
  { label: '⛩️ 관광지', value: '관광지' },
  { label: '🍱 맛집', value: '맛집' },
  { label: '🛏️ 숙소', value: '숙소' },
] as const;

// 디자인 톤에 맞춘 물방울 핀. category/icon은 고정값이라 캐시해서 재렌더 시 깜빡임을 막는다.
const iconCache: Record<string, L.DivIcon> = {};
function iconFor(place: Place) {
  const key = `${place.category}|${place.icon}`;
  if (!iconCache[key]) {
    const color = CATEGORY_COLOR[place.category];
    iconCache[key] = L.divIcon({
      className: 'tteonayo-pin',
      html: `
        <div style="width:30px;height:30px;background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:13px;line-height:1;">${place.icon}</span>
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
  target: Place | null;
  markerRefs: RefObject<Record<string, L.Marker | null>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    markerRefs.current[target.id]?.openPopup();
  }, [target, map, markerRefs]);
  return null;
}

// 팝업 안 메모 입력 — 타이핑이 지도 전체를 리렌더하지 않도록 로컬 상태로 두고 blur 시 저장
function PlacePopup({ place }: { place: Place }) {
  const { memos, setMemo, isSaved, toggleSaved, renamePlace } = useTrip();
  const [draft, setDraft] = useState(memos[place.id] ?? '');
  const [editingName, setEditingName] = useState(false);
  const saved = isSaved(place.id);

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
          ✎
        </button>
      </div>
      <div className="text-[11px] text-[#8B8272] mb-2">
        {place.category} · {place.tags.join(', ')}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setMemo(place.id, draft.trim())}
        placeholder="이 장소에 메모 남기기..."
        className="w-full h-[54px] border border-line rounded-lg px-2 py-1.5 text-[12px] bg-paper outline-none resize-none focus:border-teal"
      />
      <button
        onClick={() => toggleSaved(place.id)}
        className={`mt-1.5 w-full rounded-lg py-1.5 text-[12px] font-semibold cursor-pointer border transition-colors ${
          saved
            ? 'bg-sand text-teal-deep border-sand'
            : 'bg-teal-deep text-white border-teal-deep hover:bg-teal'
        }`}
      >
        {saved ? '✓ 저장됨 — 클릭해 해제' : '📌 장소 저장'}
      </button>
    </div>
  );
}

export default function MapPage() {
  const { places, updatePlacePosition, renamePlace, savedIds, isSaved, toggleSaved, memos } =
    useTrip();
  const [activeCategory, setActiveCategory] = useState<Place['category'] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Place | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => {
      const catOk = !activeCategory || p.category === activeCategory;
      const qOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q));
      return catOk && qOk;
    });
  }, [places, activeCategory, query]);

  const savedPlaces = places.filter((p) => savedIds.includes(p.id));

  const handleDragEnd = (id: string, marker: L.Marker) => {
    const { lat, lng } = marker.getLatLng();
    updatePlacePosition(id, lat, lng);
    setSelected((prev) => (prev && prev.id === id ? { ...prev, lat, lng } : prev));
  };

  return (
    <>
      <Topbar title="스마트 여정 지도" stamp="순천 2박 3일 일정 탐색" />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex gap-1.5 flex-wrap pb-3.5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setActiveCategory(f.value)}
              className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                activeCategory === f.value
                  ? 'bg-teal-deep text-white border-teal-deep'
                  : 'bg-white text-[#7A7364] border-line hover:bg-teal-deep hover:text-white hover:border-teal-deep'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex h-[calc(100vh-220px)] border border-line rounded-2xl overflow-hidden">
          {/* 지도 (OpenStreetMap · Leaflet) */}
          <div className="flex-1 relative">
            <MapContainer center={SUNCHEON_CENTER} zoom={13} scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {visible.map((place) => (
                <Marker
                  key={place.id}
                  position={[place.lat, place.lng]}
                  icon={iconFor(place)}
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
              <MapController target={selected} markerRefs={markerRefs} />
            </MapContainer>

            {/* 검색 */}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="장소명 또는 키워드 검색..."
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-[260px] bg-white/95 border border-line rounded-full px-4 py-2 text-[12px] shadow-md outline-none focus:border-teal"
            />

            {/* 날씨 칩 */}
            <div className="absolute top-3 right-3 z-[1000] bg-white/95 border border-line rounded-full px-3 py-1.5 text-[12px] text-ink shadow-md pointer-events-none">
              🌤 순천 · 18°C
            </div>

            {/* 안내 토스트 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-teal-deep/95 text-paper rounded-full px-4 py-2 text-[11px] shadow-lg pointer-events-none">
              📍 핀을 드래그해 위치를 옮기고, 클릭해 메모·저장하세요
            </div>
          </div>

          {/* 저장한 장소 패널 */}
          <div className="w-80 border-l border-line bg-white overflow-y-auto shrink-0">
            <div className="p-4 border-b border-line">
              <h3 className="m-0 text-sm font-display font-semibold text-teal-deep">📍 저장한 장소</h3>
              <p className="m-0 mt-1 text-[11px] text-[#8B8272]">저장한 장소가 AI 추천에 활용됩니다</p>
            </div>

            <div className="px-4 pt-3 pb-1 text-xs tracking-wider uppercase text-[#8B8272] font-semibold">
              주변 장소 ({visible.length})
            </div>
            {visible.length === 0 && (
              <p className="px-4 py-2 text-[12px] text-[#8B8272]">조건에 맞는 장소가 없어요.</p>
            )}
            {visible.map((place) => (
              <div
                key={place.id}
                onClick={() => setSelected(place)}
                className={`px-4 py-3 border-b border-[#EFE9DA] flex gap-3 items-start cursor-pointer transition-colors ${
                  selected?.id === place.id ? 'bg-paper' : 'hover:bg-paper'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-sand shrink-0 flex items-center justify-center text-[15px]">
                  {place.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="m-0 mb-0.5 text-[13px] truncate">{place.name}</h4>
                  <p className="m-0 text-[11px] text-[#8B8272]">{place.tags.join(', ')}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSaved(place.id);
                  }}
                  aria-label={isSaved(place.id) ? '저장 해제' : '장소 저장'}
                  className={`shrink-0 w-7 h-7 rounded-full text-[13px] leading-none border transition-colors cursor-pointer ${
                    isSaved(place.id)
                      ? 'bg-pin text-white border-pin'
                      : 'bg-white text-[#B7AE97] border-line hover:border-pin hover:text-pin'
                  }`}
                >
                  📌
                </button>
              </div>
            ))}

            <div className="px-4 pt-4 pb-1 text-xs tracking-wider uppercase text-[#8B8272] font-semibold">
              저장됨 ({savedPlaces.length})
            </div>
            {savedPlaces.length === 0 && (
              <p className="px-4 py-2 text-[12px] text-[#8B8272]">아직 저장한 장소가 없어요.</p>
            )}
            <div className="p-3 flex flex-col gap-2">
              {savedPlaces.map((place) => (
                <div
                  key={place.id}
                  className="bg-paper rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                >
                  <span className="text-[15px] shrink-0">{place.icon}</span>
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
                      {memos[place.id]?.trim() ? `📝 ${memos[place.id]}` : place.tags.join(', ')}
                    </div>
                  </div>
                  <button
                    onClick={() => setRenamingId((v) => (v === place.id ? null : place.id))}
                    className="shrink-0 w-6 h-6 rounded-md text-[12px] text-[#8B8272] hover:text-teal hover:bg-white cursor-pointer"
                    aria-label="이름 수정"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => toggleSaved(place.id)}
                    className="shrink-0 w-6 h-6 rounded-md text-[12px] text-[#8B8272] hover:text-pin hover:bg-white cursor-pointer"
                    aria-label="저장 삭제"
                  >
                    🗑
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
