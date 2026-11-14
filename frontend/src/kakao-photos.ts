import type { Place } from './lib.ts';
import type { KakaoMaps, KakaoPlace } from './kakao.ts';
import { coordinatesOf } from './trip.ts';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const name = (value: string) => normalize(value.replace(/\(주\)|㈜|주식회사/g, ''));
function photoSearchAddress(value: string) {
  let a = value.replace(/\([^)]*\)/g, '').trim();
  if (a.startsWith('전남광주통합특별시')) a = a.replace('전남광주통합특별시', / (동구|서구|남구|북구|광산구)( |$)/.test(a) ? '광주' : '전남');
  const regions: Record<string, string> = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원', 강원도: '강원', 충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주' };
  for (const [long, short] of Object.entries(regions)) a = a.replace(long, short);
  return a;
}
export const photoAddress = (value: string) => normalize(photoSearchAddress(value));
export function matchKakaoPlace(place: Place, candidates: KakaoPlace[]): KakaoPlace | null {
  const origin = coordinatesOf(place);
  const address = photoAddress(place.address);
  const matches = candidates.filter(candidate => {
    if (!/^[0-9]{1,20}$/.test(candidate.id) || name(place.name) !== name(candidate.place_name)) return false;
    if (address && [candidate.road_address_name, candidate.address_name].some(a => photoAddress(a || '') === address)) return true;
    const point = coordinatesOf({ longitude: candidate.x, latitude: candidate.y });
    return origin && point && Math.hypot((origin.latitude - point.latitude) * 111320,
      (origin.longitude - point.longitude) * 111320 * Math.cos(origin.latitude * Math.PI / 180)) <= 75;
  });
  const unique = new Map(matches.map(p => [p.id, p]));
  return unique.size === 1 ? unique.values().next().value! : null;
}
export function searchKakaoPlace(place: Place, maps: KakaoMaps, timeoutMs = 8000): Promise<KakaoPlace | null> {
  return new Promise(resolve => {
    let settled = false;
    const done = (value: KakaoPlace | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => done(null), timeoutMs);
    const point = coordinatesOf(place);
    try {
      const options = point ? { x: point.longitude, y: point.latitude, radius: 1000, size: 15 } : { size: 15 };
      // Address terms disambiguate businesses without coordinates, using the public SDK.
      const query = point ? place.name : `${photoSearchAddress(place.address)} ${place.name}`;
      new maps.services.Places().keywordSearch(query.slice(0, 100), (results, status) => {
        done(status === maps.services.Status.OK && Array.isArray(results) ? matchKakaoPlace(place, results) : null);
      }, options);
    } catch { done(null); }
  });
}
type PhotoResponse = { status: string; place: Place };
// Serialize browser requests; the server also rate limits collection and persists successful results.
export function createPhotoCollector(find: (p: Place) => Promise<KakaoPlace | null>, request: typeof fetch = fetch, retryMs = 300000) {
  const cache = new Map<string, { promise: Promise<Place>; expires: number }>();
  let queue = Promise.resolve();
  return (place: Place): Promise<Place> => {
    if (place.image || place.id.startsWith('demo-')) return Promise.resolve(place);
    const key = `${place.id}|${place.name}|${place.address}`;
    const existing = cache.get(key);
    if (existing && existing.expires > Date.now()) return existing.promise.then(p => ({ ...place, image: p.image, imageSource: p.imageSource, imagePage: p.imagePage, imageCollectedAt: p.imageCollectedAt }));
    const entry = { promise: Promise.resolve(place), expires: Infinity };
    entry.promise = queue.then(async () => {
      try {
        const candidate = await find(place);
        if (!candidate) return place;
        const response = await request(`/api/places/${encodeURIComponent(place.id)}/kakao-photo`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ id: candidate.id, name: candidate.place_name, roadAddress: candidate.road_address_name || '',
            lotAddress: candidate.address_name || '', longitude: candidate.x || '', latitude: candidate.y || '' }),
        });
        if (!response.ok) return place;
        const result = await response.json() as PhotoResponse;
        return result.place?.id === place.id && result.place.image ? { ...place, image: result.place.image,
          imageSource: result.place.imageSource, imagePage: result.place.imagePage, imageCollectedAt: result.place.imageCollectedAt } : place;
      } catch { return place; }
    }).then(result => { entry.expires = Date.now() + (result.image ? 7 * 86400000 : retryMs); return result; });
    if (cache.size >= 500) {
      const old = [...cache].find(([, value]) => value.expires !== Infinity);
      if (old) cache.delete(old[0]);
    }
    cache.set(key, entry);
    queue = entry.promise.then(() => {});
    return entry.promise;
  };
}
