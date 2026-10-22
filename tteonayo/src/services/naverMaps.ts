export interface NaverLatLng {
  lat(): number;
  lng(): number;
}

export interface NaverMapInstance {
  getCenter(): NaverLatLng;
  getZoom(): number;
  panTo(position: NaverLatLng): void;
  panBy(offset: object): void;
  setZoom(zoom: number): void;
}

export interface NaverInfoWindowInstance {
  open(map: NaverMapInstance, anchor: NaverLatLng): void;
  close(): void;
  setOptions(options: { pixelOffset?: object }): void;
}

export interface NaverMarkerInstance {
  getPosition(): NaverLatLng;
  setMap(map: NaverMapInstance | null): void;
}

export interface NaverEventListener {
  eventName: string;
  target: object;
}

export interface NaverMapsSdk {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Point: new (x: number, y: number) => object;
  Size: new (width: number, height: number) => object;
  Map: new (element: HTMLElement, options: { center: NaverLatLng; zoom: number }) => NaverMapInstance;
  Marker: new (options: {
    position: NaverLatLng;
    map: NaverMapInstance;
    title?: string;
    draggable?: boolean;
    clickable?: boolean;
    icon?: { content: string; size: object; anchor: object };
    zIndex?: number;
  }) => NaverMarkerInstance;
  InfoWindow: new (options: {
    content: HTMLElement;
    borderWidth?: number;
    backgroundColor?: string;
    disableAnchor?: boolean;
    disableAutoPan?: boolean;
    pixelOffset?: object;
    zIndex?: number;
  }) => NaverInfoWindowInstance;
  Event: {
    addListener(target: object, eventName: string, listener: (event: { coord?: NaverLatLng }) => void): NaverEventListener;
    removeListener(listeners: NaverEventListener | NaverEventListener[]): void;
  };
}

declare global {
  interface Window {
    naver?: { maps: NaverMapsSdk };
  }
}

let loadingSdk: Promise<NaverMapsSdk> | null = null;

export function loadNaverMaps(clientId: string): Promise<NaverMapsSdk> {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (loadingSdk) return loadingSdk;

  loadingSdk = new Promise<NaverMapsSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.async = true;
    script.onload = () => {
      if (window.naver?.maps) resolve(window.naver.maps);
      else reject(new Error('네이버 지도 SDK를 초기화하지 못했습니다. Client ID와 등록 주소를 확인해 주세요.'));
    };
    script.onerror = () => reject(new Error('네이버 지도를 불러오지 못했습니다. 연결 상태와 등록 주소를 확인해 주세요.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loadingSdk = null;
    document.querySelector('script[src^="https://oapi.map.naver.com/openapi/v3/maps.js?"]')?.remove();
    throw error;
  });

  return loadingSdk;
}
