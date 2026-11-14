import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, MapPin, RotateCcw } from 'lucide-react';
import type { Place } from './lib';
import { coordinatesOf, type Coordinate, type RoadRoute } from './trip';
import { loadKakaoMaps, type KakaoMap, type KakaoMaps, type KakaoOverlay } from './kakao';

export default function KakaoTripMap({ stops, origin, route }: { stops: Place[]; origin: Coordinate | null; route: RoadRoute | null }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<KakaoMap | null>(null);
  const overlays = useRef<KakaoOverlay[]>([]);
  const [sdk, setSdk] = useState<KakaoMaps | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const fitMap = useRef<() => void>(() => {});

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    setError(''); setSdk(null);
    loadKakaoMaps(import.meta.env.VITE_KAKAO_MAP_APP_KEY || '').then(maps => {
      if (disposed) return;
      const instance = new maps.Map(element, {
        center: new maps.LatLng(37.5665, 126.978), level: 6,
        mapTypeId: maps.MapTypeId.ROADMAP, scrollwheel: false, keyboardShortcuts: true,
      });
      instance.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      map.current = instance;
      observer = new ResizeObserver(() => {
        if (!element.clientWidth || !element.clientHeight) return;
        const center = instance.getCenter();
        instance.relayout(); instance.setCenter(center); fitMap.current();
      });
      observer.observe(element); setSdk(maps);
    }).catch(() => { if (!disposed) setError('카카오 지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'); });
    return () => {
      disposed = true; observer?.disconnect();
      overlays.current.forEach(overlay => overlay.setMap(null));
      overlays.current = []; map.current = null; fitMap.current = () => {};
      element.replaceChildren();
    };
  }, [retry]);

  useEffect(() => {
    const instance = map.current;
    if (!sdk || !instance) return;
    overlays.current.forEach(overlay => overlay.setMap(null)); overlays.current = [];
    const points: Coordinate[] = [];
    const addOverlay = (point: Coordinate, content: HTMLElement, zIndex: number) => {
      points.push(point);
      overlays.current.push(new sdk.CustomOverlay({ map: instance, position: new sdk.LatLng(point.latitude, point.longitude), content, xAnchor: .5, yAnchor: 1, zIndex }));
    };
    if (route) {
      const path = route.coordinates.map(([lon, lat]) => new sdk.LatLng(lat, lon));
      for (const [color, weight] of [['#ffffff', 9], ['#2e5943', 5]] as const) {
        overlays.current.push(new sdk.Polyline({ map: instance, path, strokeWeight: weight, strokeColor: color, strokeOpacity: .95, strokeStyle: 'solid' }));
      }
    }
    if (origin) {
      const pin = document.createElement('div');
      pin.className = 'kakao-origin-pin'; pin.title = '현재 위치 · 출발';
      pin.setAttribute('role', 'img'); pin.setAttribute('aria-label', '현재 위치 · 출발');
      pin.appendChild(document.createElement('span')); addOverlay(origin, pin, 20);
    }
    stops.forEach((stop, index) => {
      const coordinate = coordinatesOf(stop);
      if (!coordinate) return;
      const pin = document.createElement('div');
      pin.className = `kakao-stop-pin ${index === stops.length - 1 ? 'last' : ''}`;
      pin.title = `${index + 1}. ${stop.name}`; pin.tabIndex = 0;
      pin.setAttribute('role', 'img'); pin.setAttribute('aria-label', pin.title);
      const number = document.createElement('span');
      number.className = 'kakao-pin-number'; number.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'kakao-pin-label'; label.textContent = stop.name;
      pin.append(number, label); addOverlay(coordinate, pin, 10 + index);
    });
    if (route) points.push(...route.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })));
    fitMap.current = () => {
      if (!container.current?.clientWidth || !container.current?.clientHeight) return;
      if (points.length === 1) {
        instance.setCenter(new sdk.LatLng(points[0].latitude, points[0].longitude)); instance.setLevel(4);
      } else if (points.length > 1) {
        const bounds = new sdk.LatLngBounds();
        points.forEach(point => bounds.extend(new sdk.LatLng(point.latitude, point.longitude)));
        instance.setBounds(bounds, 64, 64, 64, 64);
      } else {
        instance.setCenter(new sdk.LatLng(37.5665, 126.978)); instance.setLevel(6);
      }
    };
    fitMap.current();
    return () => { fitMap.current = () => {}; };
  }, [sdk, stops, origin, route]);

  return <div className="trip-map-wrap">
    <div ref={container} className="trip-map kakao-trip-map" role="region" aria-label="카카오 일반지도 · 선택한 장소와 자동차 이동 경로"/>
    {error ? <div className="trip-map-status" role="alert"><MapPin size={27}/><strong>지도를 불러오지 못했어요</strong><p>{error}</p><button onClick={() => setRetry(n => n + 1)}><RotateCcw size={15}/> 다시 시도</button></div>
      : !sdk ? <div className="trip-map-status" role="status"><LoaderCircle className="spin" size={25}/><strong>카카오 지도를 불러오고 있어요</strong></div>
      : <><span className="trip-map-provider">카카오맵 · 일반지도</span>{!stops.length && <div className="trip-map-hint"><strong>우리의 다음 여행은 어디일까요?</strong><span>아래에서 장소를 골라 코스에 담아보세요.</span></div>}</>}
  </div>;
}
