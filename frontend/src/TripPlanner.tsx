import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Car, Check, Clock3, LocateFixed, LoaderCircle, MapPin, Navigation, Plus, RotateCcw, Route, Share2, Trash2, X } from 'lucide-react';
import type { Place } from './lib';
import { categoryLabel } from './lib';
import { coordinatesOf, fetchRoadRoute, formatDistance, formatDuration, MAX_STOPS, routeKey, type Coordinate, type RoadRoute } from './trip';
import TripMap from './KakaoTripMap';
import './trip.css';
import ShareTrip from './ShareTrip';

export default function TripPlanner({ loggedIn, stops, onChange, onBrowse, onShare }: { loggedIn: boolean; stops: Place[]; onChange: (stops: Place[]) => void; onBrowse: () => void; onShare: () => void }) {
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, { route: RoadRoute; expires: number }>());
  const nextRequest = useRef(0);
  const locationRequest = useRef(0);
  const points = useMemo(() => {
    const places = stops.map(coordinatesOf).filter((p): p is Coordinate => p !== null);
    return origin ? [origin, ...places] : places;
  }, [stops, origin]);

  useEffect(() => () => { locationRequest.current++; }, []);
  useEffect(() => {
    setRoute(null); setError('');
    if (!stops.length || points.length < 2) { setLoading(false); return; }
    const key = routeKey(points);
    const cached = cache.current.get(key);
    if (cached && cached.expires > Date.now()) { setRoute(cached.route); setLoading(false); return; }
    const controller = new AbortController();
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    // Debounce edits and keep demo-service requests at least 1.1 seconds apart.
    const timer = setTimeout(async () => {
      nextRequest.current = Date.now() + 1100;
      let timedOut = false;
      timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
      try {
        const result = await fetchRoadRoute(points, controller.signal, import.meta.env.VITE_ROUTING_BASE_URL || undefined);
        if (disposed || controller.signal.aborted) return;
        if (cache.current.size >= 30) cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(key, { route: result, expires: Date.now() + 600_000 });
        setRoute(result);
      } catch (e) {
        if (!disposed && (!controller.signal.aborted || timedOut)) setError(timedOut ? '경로 조회가 지연되고 있어요. 잠시 후 다시 시도해주세요.' : e instanceof Error ? e.message : '경로를 불러오지 못했어요.');
      } finally {
        clearTimeout(timeout);
        if (!disposed && (!controller.signal.aborted || timedOut)) setLoading(false);
      }
    }, Math.max(650, nextRequest.current - Date.now()));
    return () => { disposed = true; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [points, stops.length, retry]);

  const locate = () => {
    setLocationError('');
    if (!navigator.geolocation) { setLocationError('현재 위치를 지원하지 않는 브라우저예요. 첫 번째 장소를 출발점으로 이용해주세요.'); return; }
    const request = ++locationRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (locationRequest.current !== request) return;
      setLocating(false);
      const coordinate = coordinatesOf({ latitude: String(position.coords.latitude), longitude: String(position.coords.longitude) });
      if (!coordinate) { setLocationError('현재 위치가 국내 경로 지원 범위 밖이에요. 첫 번째 장소를 출발점으로 이용해주세요.'); return; }
      setOrigin(coordinate);
    }, e => {
      if (locationRequest.current !== request) return;
      setLocating(false);
      setLocationError(e.code === 1 ? '위치 권한이 허용되지 않았어요. 기존 출발점을 유지해요.' : '현재 위치를 확인하지 못했어요. 기존 출발점을 유지해요.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  };
  const move = (index: number, direction: number) => {
    const updated = [...stops];
    [updated[index], updated[index + direction]] = [updated[index + direction], updated[index]];
    onChange(updated);
  };

  return <section className="trip-planner" aria-labelledby="trip-heading">
    <div className="trip-heading"><div><div className="eyebrow">OUR LITTLE ITINERARY</div><h2 id="trip-heading">좋아하는 곳을 잇는, 우리만의 코스 <Route size={23}/></h2><p>음식점, 카페, 숙소를 담으면 방문 순서대로 자동차 경로가 펼쳐져요.</p></div><span className="trip-mode"><Car size={15}/> 자동차 이동</span></div>
    <div className="trip-layout"><div className="trip-sidebar">
      <div className="trip-list-heading"><h3><Navigation size={17}/> 나의 여행 코스 <span>{stops.length}/{MAX_STOPS}</span></h3>{stops.length > 0 && <button onClick={() => onChange([])} aria-label="여행 코스 전체 비우기"><Trash2 size={14}/> 비우기</button>}</div>
      <button className={`trip-locate ${origin ? 'located' : ''}`} onClick={locate} disabled={locating}>{locating ? <LoaderCircle size={16} className="spin"/> : origin ? <Check size={16}/> : <LocateFixed size={16}/>} {locating ? '현재 위치 확인 중…' : origin ? '현재 위치에서 출발' : '현재 위치를 출발점으로'}</button>
      {origin ? <div className="trip-origin-note">현재 위치 → 선택한 장소 순서로 이동해요.<button aria-label="현재 위치 출발 해제" onClick={() => { setOrigin(null); setLocationError(''); }}><X size={13}/></button></div> : <p className="trip-origin-note">첫 번째로 담은 장소가 출발점이에요.</p>}
      {locationError && <p className="trip-inline-error" role="alert">{locationError}</p>}
      {stops.length ? <ol className="trip-stops">{stops.map((place, index) => {
        const leg = route?.legs[index - (origin ? 0 : 1)];
        return <li key={place.id}>
          {leg && <div className="trip-leg"><Car size={12}/> {formatDuration(leg.duration)} <span>· {formatDistance(leg.distance)}</span></div>}
          <div className="trip-stop"><span className={`trip-stop-number ${index === stops.length - 1 ? 'last' : ''}`}>{index + 1}</span><div className="trip-stop-info"><span>{!origin && index === 0 ? '출발' : index === stops.length - 1 ? '도착' : '경유'} · {categoryLabel(place.category)}</span><strong>{place.name}</strong><p>{place.address}</p></div><button className="trip-remove" onClick={() => onChange(stops.filter(p => p.id !== place.id))} aria-label={`${place.name} 코스에서 삭제`}><X size={15}/></button></div>
          <div className="trip-reorder"><button disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${place.name} 방문 순서 앞으로`}><ArrowUp size={12}/> 앞으로</button><button disabled={index === stops.length - 1} onClick={() => move(index, 1)} aria-label={`${place.name} 방문 순서 뒤로`}><ArrowDown size={12}/> 뒤로</button></div>
        </li>;
      })}</ol> : <div className="trip-empty"><div><MapPin size={27}/><Route size={18}/></div><h4>한 곳씩 담아, 여행을 완성해요</h4><p>맛있는 식사, 느긋한 커피, 편안한 하룻밤.<br/>마음에 드는 장소에서 ‘코스에 담기’를 눌러주세요.</p></div>}
      <button className="trip-add" onClick={onBrowse} disabled={stops.length >= MAX_STOPS}><Plus size={16}/>{stops.length >= MAX_STOPS ? `최대 ${MAX_STOPS}곳까지 담을 수 있어요` : '방문할 장소 고르기'}</button>
      <button className="trip-community-share" onClick={onShare} disabled={!loggedIn || stops.length < 2} title={!loggedIn ? '로그인 후 공유할 수 있어요.' : undefined}><Share2 size={16}/> 이 코스 커뮤니티에 공유하기</button>
      <ShareTrip stops={stops} loggedIn={loggedIn}/>
      <p className="trip-location-privacy">현재 위치는 출발점 설정에만 사용해요. 코스에 담을 때 장소 주소를 카카오에 조회하고, 경로 계산 시 위치와 선택 장소의 좌표를 외부 경로 서비스로 전송해요.</p>
    </div><div className="trip-map-panel"><TripMap stops={stops} origin={origin} route={route}/>
      <div className="trip-route-summary" aria-live="polite" aria-atomic="true">
        {loading ? <div className="trip-summary-message"><LoaderCircle className="spin" size={20}/><div><strong>함께 갈 길을 찾고 있어요</strong><span>선택한 순서대로 자동차 경로를 계산 중이에요.</span></div></div>
          : error ? <div className="trip-summary-error"><p role="alert">{error}</p><button onClick={() => setRetry(n => n + 1)}><RotateCcw size={14}/> 다시 시도</button></div>
          : route ? <><div className="trip-summary-stat"><Route size={19}/><div><span>총 이동 거리</span><strong>{formatDistance(route.distance)}</strong></div></div><div className="trip-summary-stat"><Clock3 size={19}/><div><span>예상 이동 시간</span><strong>{formatDuration(route.duration)}</strong></div></div><span className="trip-summary-caption">방문 순서대로 연결한 코스<br/>실시간 교통·체류 시간 미포함</span></>
          : <div className="trip-summary-message"><Route size={22}/><div><strong>{stops.length ? '다음 장소를 담아 코스를 이어보세요' : '장소를 선택하면 지도에 표시돼요'}</strong><span>{stops.length ? '두 곳 이상 담거나 현재 위치를 출발점으로 설정하면 경로가 나와요.' : '선택한 장소의 번호와 방문 순서를 한눈에 확인할 수 있어요.'}</span></div></div>}
      </div><p className="trip-map-note">경로: <a href="https://project-osrm.org/" target="_blank" rel="noreferrer">OSRM</a> · OpenStreetMap 기반 자동차 예상 경로이며, 도로 상황과 동반 조건은 방문 전 확인해주세요.</p>
    </div></div>
  </section>;
}
