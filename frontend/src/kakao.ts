// The SDK surface used by the trip map. The SDK itself is loaded from Kakao.
export type KakaoLatLng = { getLat(): number; getLng(): number };
export type KakaoBounds = { extend(point: KakaoLatLng): void };
export type KakaoMap = {
  setCenter(point: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  setLevel(level: number): void;
  setBounds(bounds: KakaoBounds, top?: number, right?: number, bottom?: number, left?: number): void;
  addControl(control: unknown, position: unknown): void;
  relayout(): void;
};
export type KakaoOverlay = { setMap(map: KakaoMap | null): void };
export type KakaoPlace = { id: string; place_name: string; road_address_name: string; address_name: string; x: string; y: string; place_url?: string };
export type KakaoMaps = {
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number; mapTypeId: unknown; scrollwheel: boolean; keyboardShortcuts: boolean }) => KakaoMap;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoBounds;
  CustomOverlay: new (options: { map: KakaoMap; position: KakaoLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number }) => KakaoOverlay;
  Polyline: new (options: { map: KakaoMap; path: KakaoLatLng[]; strokeWeight: number; strokeColor: string; strokeOpacity: number; strokeStyle: string }) => KakaoOverlay;
  ZoomControl: new () => unknown;
  MapTypeId: { ROADMAP: unknown };
  ControlPosition: { RIGHT: unknown };
  services: {
    Places: new () => { keywordSearch(query: string, callback: (results: KakaoPlace[], status: string) => void, options?: { x?: number; y?: number; radius?: number; size?: number }): void };
    Geocoder: new () => { addressSearch(address: string, callback: (results: { x: string; y: string }[], status: string) => void, options?: { analyze_type: string; size: number }) : void };
    Status: { OK: string; ZERO_RESULT: string };
    AnalyzeType: { EXACT: string };
  };
};
type KakaoWindow = { kakao?: { maps?: Partial<KakaoMaps> } };
type SdkEnvironment = { browser: KakaoWindow; document: Document };

export function createKakaoLoader(getEnvironment: () => SdkEnvironment = () => ({ browser: window as KakaoWindow, document }), timeoutMs = 15000) {
  let pending: Promise<KakaoMaps> | null = null;
  return function load(appKey: string): Promise<KakaoMaps> {
    const key = appKey.trim();
    if (!key) return Promise.reject(new Error('카카오 지도 설정을 확인해주세요.'));
    const { browser, document: doc } = getEnvironment();
    if (browser.kakao?.maps?.Map && browser.kakao.maps.services?.Geocoder) return Promise.resolve(browser.kakao.maps as KakaoMaps);
    if (pending) return pending;
    pending = new Promise<KakaoMaps>((resolve, reject) => {
      const script = doc.createElement('script');
      script.id = 'daeng-kakao-maps-sdk'; script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=${encodeURIComponent(key)}`;
      const cleanup = () => { clearTimeout(timer); script.onload = null; script.onerror = null; };
      const fail = () => { cleanup(); script.remove(); reject(new Error('카카오 지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')); };
      const timer = setTimeout(fail, timeoutMs);
      script.onerror = fail;
      script.onload = () => {
        const maps = browser.kakao?.maps;
        if (!maps?.load) { fail(); return; }
        try {
          maps.load(() => {
            if (!browser.kakao?.maps?.Map || !browser.kakao.maps.services?.Geocoder) { fail(); return; }
            cleanup(); resolve(browser.kakao.maps as KakaoMaps);
          });
        } catch { fail(); }
      };
      doc.head.appendChild(script);
    }).catch(error => { pending = null; throw error; });
    return pending;
  };
}

export const loadKakaoMaps = createKakaoLoader();
