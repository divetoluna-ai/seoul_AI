import { useEffect, useRef } from 'react';
import type { Place } from './lib';
import { loadKakaoMaps } from './kakao';
import { collectPhotoPage, createPhotoCollector, searchKakaoPlace } from './kakao-photos';

const collect = createPhotoCollector(async place => {
  const maps = await loadKakaoMaps(import.meta.env.VITE_KAKAO_MAP_APP_KEY || '');
  return searchKakaoPlace(place, maps);
});

export function usePagePhotos(places: Place[], scope: string, enabled: boolean, onPhoto: (place: Place) => void) {
  const snapshot = useRef(places);
  snapshot.current = places;
  // Photo updates may reorder cards; neither updates nor reordering should restart this batch.
  const identity = JSON.stringify(places.map(p => [p.id, p.name, p.address, p.longitude, p.latitude]).sort());
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void collectPhotoPage(snapshot.current, collect, onPhoto, controller.signal);
    return () => controller.abort();
  }, [scope, identity, enabled, onPhoto]);
}
