import { useEffect, useState } from 'react';
import { Car, Clock3, LoaderCircle, Route, RotateCcw } from 'lucide-react';
import type { Place } from './lib';
import { coordinatesOf, fetchRoadRoute, formatDistance, formatDuration, routeKey, type RoadRoute } from './trip';
import KakaoTripMap from './KakaoTripMap';

const cache = new Map<string, { route: RoadRoute; expires: number }>();
export default function CoursePreview({ stops }: { stops: Place[] }) {
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const points = stops.map(coordinatesOf);
    setRoute(null); setError('');
    if (points.some(p => !p) || points.length < 2) { setLoading(false); setError('코스의 장소 위치를 확인하지 못했어요.'); return; }
    const coordinates = points.filter(p => p !== null);
    const key = routeKey(coordinates);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) { setRoute(cached.route); setLoading(false); return; }
    const controller = new AbortController(); let active = true;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 15000);
    const timer = setTimeout(() => {
      fetchRoadRoute(coordinates, controller.signal, import.meta.env.VITE_ROUTING_BASE_URL || undefined).then(result => {
        if (!active) return;
        if (cache.size >= 30) cache.delete(cache.keys().next().value!);
        cache.set(key, { route: result, expires: Date.now() + 600000 }); setRoute(result);
      }).catch(e => { if (active) setError(controller.signal.aborted ? '경로 조회가 지연되고 있어요. 다시 시도해주세요.' : (e as Error).message); })
        .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    }, 650);
    return () => { active = false; controller.abort(); clearTimeout(timer); clearTimeout(timeout); };
  }, [stops, retry]);
  return <section className="course-preview" aria-label="공유 코스 지도와 자동차 경로">
    <KakaoTripMap stops={stops} origin={null} route={route}/>
    <div className="course-preview-summary" aria-live="polite">
      {loading ? <span><LoaderCircle className="spin" size={16}/> 자동차 경로를 확인하고 있어요</span> : error ? <><p role="alert">{error}</p><button onClick={() => setRetry(n => n + 1)}><RotateCcw size={14}/> 다시 시도</button></> : route ? <><span><Route size={16}/>{formatDistance(route.distance)}</span><span><Clock3 size={16}/>{formatDuration(route.duration)}</span></> : null}
    </div>
    <p className="course-preview-note"><Car size={13}/> OSRM 자동차 예상 경로 · 실시간 교통과 방문 시간은 포함하지 않아요.</p>
  </section>;
}
