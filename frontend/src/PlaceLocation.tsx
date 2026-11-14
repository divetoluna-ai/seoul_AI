import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LoaderCircle, MapPin, Navigation, RotateCcw } from 'lucide-react';
import { directionsUrl, mapUrl, type Place } from './lib';
import { locatePlace } from './geocoding';
import { coordinatesOf } from './trip';
import KakaoTripMap from './KakaoTripMap';
import './place-location.css';

export default function PlaceLocation({ place }: { place: Place }) {
  const [result, setResult] = useState<{ key: string; place: Place } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([place.id, place.address, place.latitude, place.longitude]);
  const located = result?.key === key ? result.place : coordinatesOf(place) ? place : null;
  const stops = useMemo(() => located ? [located] : [], [located]);
  const directions = located ? directionsUrl(located) : null;

  useEffect(() => {
    let disposed = false;
    setError('');
    if (place.id.startsWith('demo-')) return;
    locatePlace(place).then(found => { if (!disposed) setResult({ key, place: found }); })
      .catch(() => { if (!disposed) setError('정확한 위치를 확인하지 못했어요. 카카오맵 검색에서 업소와 주소를 확인해주세요.'); });
    return () => { disposed = true; };
  }, [key, retry]);

  if (place.id.startsWith('demo-')) return null;
  return <section className="detail-location" aria-label={`${place.name} 위치와 카카오맵 길찾기`}>
    <div className="detail-location-heading"><h3><MapPin size={17}/> 위치 · 길찾기</h3><span>카카오맵 연동</span></div>
    {located ? <KakaoTripMap stops={stops} origin={null} route={null}/>
      : <div className="detail-location-placeholder" aria-live="polite">
        {error ? <><MapPin size={24}/><p role="alert">{error}</p><button onClick={() => setRetry(n => n + 1)}><RotateCcw size={14}/> 위치 다시 확인</button></>
          : <><LoaderCircle size={23} className="spin"/><p>주소로 장소의 위치를 확인하고 있어요.</p></>}
      </div>}
    <div className="detail-location-actions">
      <a href={mapUrl(located || place)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{located ? '카카오맵에서 보기' : '카카오맵에서 검색'}</a>
      {directions ? <a className="detail-directions" href={directions} target="_blank" rel="noreferrer"><Navigation size={15}/> 카카오맵 길찾기</a>
        : <button className="detail-directions" disabled><Navigation size={15}/>{error ? '위치 확인 후 길찾기' : '위치 확인 중…'}</button>}
    </div>
    <p className="detail-location-note">길찾기는 카카오맵에서 출발지와 이동 수단을 선택해 이용할 수 있어요.</p>
  </section>;
}
