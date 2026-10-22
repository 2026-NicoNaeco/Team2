import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Place } from '../types';
import type { PlaceCandidate } from '../services/placeSearch';
import type { MapCardState } from './MapPlaceCard';
import { PIN_COLOR } from './mapPinColors';
import {
  loadNaverMaps, type NaverEventListener, type NaverInfoWindowInstance, type NaverMapInstance,
  type NaverMapsSdk, type NaverMarkerInstance,
} from '../services/naverMaps';


export interface MapFocus {
  lat: number;
  lng: number;
  zoom?: number;
  key: number;
}

interface Props {
  clientId: string;
  center: [number, number];
  candidates: PlaceCandidate[];
  savedPlaces: Place[];
  draftPosition: [number, number] | null;
  focus: MapFocus | null;
  card: MapCardState | null;
  cardContent: ReactNode;
  onCenterChange: (center: [number, number]) => void;
  onPick: (position: [number, number]) => void;
  onSelectSaved: (place: Place) => void;
  onSelectCandidate: (place: PlaceCandidate) => void;
  onDragSaved: (id: string, lat: number, lng: number) => void;
}

// 카드 꼬리 끝이 핀 머리·번호 원·클릭 지점에 닿도록 하는 세로 간격(px)
const CARD_OFFSET: Record<MapCardState['anchor'], number> = { pin: -36, dot: -18, point: -8 };

function savedIcon(sdk: NaverMapsSdk, category: Place['category']) {
  const color = PIN_COLOR[category];
  return {
    content: `<div style="width:30px;height:30px;background:${color};border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="width:8px;height:8px;border-radius:50%;background:white"></span></div>`,
    size: new sdk.Size(30, 30),
    anchor: new sdk.Point(15, 30),
  };
}

// 검색 결과는 목록 번호와 같은 숫자 원으로 표시해 저장한 장소 핀과 구분한다.
function candidateIcon(sdk: NaverMapsSdk, category: Place['category'], label: number) {
  const color = PIN_COLOR[category];
  return {
    content: `<div style="width:24px;height:24px;border-radius:50%;background:white;border:2px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,.3);color:${color};font:700 12px/20px Pretendard,sans-serif;text-align:center">${label}</div>`,
    size: new sdk.Size(24, 24),
    anchor: new sdk.Point(12, 12),
  };
}

function createCardHost() {
  // 크기 0인 기준점 안에 카드를 아래쪽 기준으로 띄워, 내용 높이가 바뀌어도 꼬리 위치가 고정되게 한다.
  const host = document.createElement('div');
  host.style.cssText = 'position:relative;width:0;height:0;overflow:visible';
  // 카드 안 클릭·드래그가 지도 클릭(주변 장소 찾기)으로 이어지지 않게 막는다.
  for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel', 'contextmenu']) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }
  return host;
}

export default function NaverPlaceMap({
  clientId, center, candidates, savedPlaces, draftPosition, focus, card, cardContent,
  onCenterChange, onPick, onSelectSaved, onSelectCandidate, onDragSaved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<NaverMapsSdk | null>(null);
  const mapRef = useRef<NaverMapInstance | null>(null);
  const infoWindowRef = useRef<NaverInfoWindowInstance | null>(null);
  const markersRef = useRef<NaverMarkerInstance[]>([]);
  const listenersRef = useRef<NaverEventListener[]>([]);
  const callbacksRef = useRef({ onCenterChange, onPick, onSelectSaved, onSelectCandidate, onDragSaved });
  const [cardHost] = useState(createCardHost);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    callbacksRef.current = { onCenterChange, onPick, onSelectSaved, onSelectCandidate, onDragSaved };
  });

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    const mapListeners: NaverEventListener[] = [];
    loadNaverMaps(clientId).then((sdk) => {
      if (!active || !container) return;
      const map = new sdk.Map(container, {
        center: new sdk.LatLng(center[0], center[1]), zoom: 14,
      });
      sdkRef.current = sdk;
      mapRef.current = map;
      infoWindowRef.current = new sdk.InfoWindow({
        content: cardHost, borderWidth: 0, backgroundColor: 'transparent',
        disableAnchor: true, disableAutoPan: true, zIndex: 200,
      });
      mapListeners.push(sdk.Event.addListener(map, 'idle', () => {
        const position = map.getCenter();
        callbacksRef.current.onCenterChange([position.lat(), position.lng()]);
      }));
      mapListeners.push(sdk.Event.addListener(map, 'click', (event) => {
        if (event.coord) {
          callbacksRef.current.onPick([event.coord.lat(), event.coord.lng()]);
        }
      }));
      setReady(true);
      setError('');
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : '네이버 지도를 불러오지 못했습니다.');
    });
    return () => {
      active = false;
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      sdkRef.current?.Event.removeListener(mapListeners);
      sdkRef.current?.Event.removeListener(listenersRef.current);
      listenersRef.current = [];
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
      sdkRef.current = null;
      setReady(false);
      container?.replaceChildren();
    };
    // The map must be created once for a given Client ID; later moves use the focus prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, retry]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const map = mapRef.current;
    if (!ready || !sdk || !map) return;

    candidates.forEach((candidate, index) => {
      const marker = new sdk.Marker({
        map, position: new sdk.LatLng(candidate.lat, candidate.lng),
        title: candidate.name, icon: candidateIcon(sdk, candidate.category, index + 1), zIndex: 50,
      });
      markersRef.current.push(marker);
      listenersRef.current.push(sdk.Event.addListener(marker, 'click', () => callbacksRef.current.onSelectCandidate(candidate)));
    });
    for (const place of savedPlaces) {
      const marker = new sdk.Marker({
        map, position: new sdk.LatLng(place.lat, place.lng),
        title: place.name, icon: savedIcon(sdk, place.category), draggable: true, zIndex: 100,
      });
      markersRef.current.push(marker);
      listenersRef.current.push(sdk.Event.addListener(marker, 'click', () => callbacksRef.current.onSelectSaved(place)));
      listenersRef.current.push(sdk.Event.addListener(marker, 'dragend', () => {
        const position = marker.getPosition();
        callbacksRef.current.onDragSaved(place.id, position.lat(), position.lng());
      }));
    }
    if (draftPosition) {
      markersRef.current.push(new sdk.Marker({
        map, position: new sdk.LatLng(draftPosition[0], draftPosition[1]),
        clickable: false,
      }));
    }
    return () => {
      sdk.Event.removeListener(listenersRef.current);
      listenersRef.current = [];
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [ready, candidates, savedPlaces, draftPosition]);

  useEffect(() => {
    const sdk = sdkRef.current;
    const map = mapRef.current;
    if (!ready || !sdk || !map || !focus) return;
    map.panTo(new sdk.LatLng(focus.lat, focus.lng));
    const zoom = focus.zoom ?? 15;
    if (focus.zoom !== undefined || map.getZoom() < zoom) map.setZoom(zoom);
  }, [ready, focus]);

  const cardAnchor = card ? `${card.key}:${card.lat}:${card.lng}:${card.anchor}` : '';
  useEffect(() => {
    const sdk = sdkRef.current;
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    if (!ready || !sdk || !map || !infoWindow) return;
    if (!card) {
      infoWindow.close();
      return;
    }
    infoWindow.setOptions({ pixelOffset: new sdk.Point(0, CARD_OFFSET[card.anchor]) });
    infoWindow.open(map, new sdk.LatLng(card.lat, card.lng));
    // card 객체 전체가 아니라 위치가 바뀔 때만 다시 연다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cardAnchor]);

  // 카드가 지도 밖으로 잘리면 그만큼 지도를 옮긴다(내용이 늘어난 경우 포함).
  useLayoutEffect(() => {
    const sdk = sdkRef.current;
    const map = mapRef.current;
    const element = cardRef.current;
    const container = containerRef.current;
    if (!ready || !sdk || !map || !element || !container || !card) return;
    const frame = window.requestAnimationFrame(() => {
      const box = element.getBoundingClientRect();
      const bounds = container.getBoundingClientRect();
      if (!box.width) return;
      const margin = 12;
      const dx = box.left < bounds.left + margin ? box.left - bounds.left - margin
        : box.right > bounds.right - margin ? box.right - bounds.right + margin : 0;
      const dy = box.top < bounds.top + margin ? box.top - bounds.top - margin : 0;
      if (dx || dy) map.panBy(new sdk.Point(dx, dy));
    });
    return () => window.cancelAnimationFrame(frame);
  });

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="네이버 지도" />
      {card && createPortal(
        <div ref={cardRef} className="absolute bottom-0 left-0 -translate-x-1/2">{cardContent}</div>,
        cardHost,
      )}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper p-6 text-center text-sm text-ink-soft">
          {error ? (
            <div>
              <p role="alert">{error}</p>
              <button type="button" onClick={() => { setError(''); setRetry((value) => value + 1); }}
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-teal-deep cursor-pointer">다시 시도</button>
            </div>
          ) : '네이버 지도를 불러오는 중…'}
        </div>
      )}
    </div>
  );
}
