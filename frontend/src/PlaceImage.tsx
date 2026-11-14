import { useEffect, useRef, useState } from 'react';
import { type Place, safeImage } from './lib';
import { loadKakaoMaps } from './kakao';
import { createPhotoCollector, searchKakaoPlace } from './kakao-photos';

const collectPhoto = createPhotoCollector(async place => {
  const maps = await loadKakaoMaps(import.meta.env.VITE_KAKAO_MAP_APP_KEY || '');
  return searchKakaoPlace(place, maps);
});

export default function PlaceImage({ place, className, onPhoto }: { place: Place; className?: string; onPhoto: (p: Place) => void }) {
  const ref = useRef<HTMLImageElement>(null);
  const [resolved, setResolved] = useState<Place | null>(null);
  useEffect(() => {
    if (place.image || place.id.startsWith('demo-')) return;
    let active = true;
    const collect = () => {
      void collectPhoto(place).then(updated => {
        if (active && updated.image) { setResolved(updated); onPhoto(updated); }
      });
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); collect(); }
    }, { rootMargin: '100px' });
    if (observer && ref.current) observer.observe(ref.current); else collect();
    return () => { active = false; observer?.disconnect(); };
  }, [place.id, place.name, place.address, place.image, onPhoto]);
  const image = place.image || (resolved?.id === place.id ? resolved.image : '');
  return <img ref={ref} className={className} src={safeImage(image)} alt={`${place.name} 사진`} loading="lazy"
    onError={e => { if (e.currentTarget.getAttribute('src') !== '/images/placeholder.svg') e.currentTarget.src = '/images/placeholder.svg'; }}/>;
}
