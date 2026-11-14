import type { Place } from './lib.ts';
import { loadKakaoMaps, type KakaoMaps } from './kakao.ts';
import { coordinatesOf } from './trip.ts';

export function geocodingAddress(address: string) {
  let query = address.split('(')[0].trim();
  // Preserve the source address for display; use the map index's province names for lookup.
  if (query.startsWith('전남광주통합특별시 ')) {
    const district = query.split(/\s+/)[1];
    query = query.replace('전남광주통합특별시', ['동구', '서구', '남구', '북구', '광산구'].includes(district) ? '광주광역시' : '전라남도');
  }
  return query;
}

export function resolvePlaceCoordinates(place: Place, maps: KakaoMaps, timeoutMs = 12000): Promise<Place> {
  if (coordinatesOf(place)) return Promise.resolve(place);
  const address = geocodingAddress(place.address);
  if (!address || !maps.services?.Geocoder) return Promise.reject(new Error('장소의 위치를 확인하지 못했어요. 상세 화면에서 지도 검색을 이용해주세요.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (message: string) => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(message)); } };
    const timer = setTimeout(() => fail('위치 확인이 지연되고 있어요. 잠시 후 다시 시도해주세요.'), timeoutMs);
    try {
      new maps.services.Geocoder().addressSearch(address, (results, status) => {
        if (settled) return;
        if (status !== maps.services.Status.OK || !Array.isArray(results)) { fail('정확한 주소의 위치를 찾지 못했어요. 상세 화면에서 지도 검색을 이용해주세요.'); return; }
        const coordinates = results.map(result => coordinatesOf({ latitude: String(result.y ?? ''), longitude: String(result.x ?? '') })).filter(p => p !== null);
        const unique = new Map(coordinates.map(p => [`${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`, p]));
        if (unique.size !== 1) { fail('장소의 위치가 명확하지 않아 코스에 담지 못했어요. 상세 화면에서 주소를 확인해주세요.'); return; }
        const coordinate = unique.values().next().value!;
        settled = true; clearTimeout(timer);
        resolve({ ...place, latitude: String(coordinate.latitude), longitude: String(coordinate.longitude) });
      }, { analyze_type: maps.services.AnalyzeType.EXACT, size: 10 });
    } catch { fail('위치 서비스에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'); }
  });
}

// Reuse successful address lookups between detail views and itinerary selections.
export function createPlaceLocator(getMaps: () => Promise<KakaoMaps>) {
  const cache = new Map<string, Promise<{ latitude: string; longitude: string }>>();
  return async (place: Place): Promise<Place> => {
    if (coordinatesOf(place)) return place;
    const key = geocodingAddress(place.address);
    let pending = cache.get(key);
    if (!pending) {
      pending = getMaps().then(maps => resolvePlaceCoordinates(place, maps))
        .then(located => ({ latitude: located.latitude, longitude: located.longitude }));
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, pending);
      pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    }
    return { ...place, ...await pending };
  };
}

export const locatePlace = createPlaceLocator(() => loadKakaoMaps(import.meta.env.VITE_KAKAO_MAP_APP_KEY || ''));
