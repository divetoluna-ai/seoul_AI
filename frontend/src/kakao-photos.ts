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
const needsPhoto = (p: Place) => !p.image || (p.imageSource === 'kakao' && !/^\/api\/places\/photos\/[a-f0-9]{64}$/.test(p.image));
const photoKey = (p: Place) => JSON.stringify([p.id, p.name, p.address, p.longitude, p.latitude]);
const withPhoto = (place: Place, photo: Place): Place => ({ ...place, image: photo.image,
  imageSource: photo.imageSource, imagePage: photo.imagePage, imageCollectedAt: photo.imageCollectedAt });

// Only one lookup/page fetch is active. Abandoned pages never leave a backlog of requests.
export function createPhotoCollector(find: (p: Place) => Promise<KakaoPlace | null>, request: typeof fetch = fetch, retryMs = 300000) {
  const cache = new Map<string, { photo: Place; expires: number }>();
  let queue = Promise.resolve();
  return (place: Place, signal?: AbortSignal): Promise<Place> => {
    if (!needsPhoto(place) || place.id.startsWith('demo-') || signal?.aborted) return Promise.resolve(place);
    const key = photoKey(place);
    const task = queue.then(async () => {
      if (signal?.aborted) return place;
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return withPhoto(place, cached.photo);
      let result = place;
      try {
        const post = async (path: string, body?: object): Promise<PhotoResponse | null> => {
          if (signal?.aborted) return null;
          const timeout = AbortSignal.timeout(30000);
          const response = await request(`/api/places/${encodeURIComponent(place.id)}/${path}`, {
            method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
          });
          return response.ok ? await response.json() as PhotoResponse : null;
        };
        // The backend checks official images and its persistent cache before any Kakao search.
        let response = await post('photo');
        if (response?.status === 'search-required' && !signal?.aborted) {
          const candidate = await find(place);
          if (candidate && !signal?.aborted) response = await post('kakao-photo', {
            id: candidate.id, name: candidate.place_name, roadAddress: candidate.road_address_name || '',
            lotAddress: candidate.address_name || '', longitude: candidate.x || '', latitude: candidate.y || '',
          });
        }
        if (response?.place?.id === place.id && response.place.image) result = withPhoto(place, response.place);
      } catch { /* A failed photo must not prevent browsing the rest of the page. */ }
      if (!signal?.aborted) {
        if (cache.size >= 500) cache.delete(cache.keys().next().value!);
        cache.set(key, { photo: result, expires: Date.now() + (!needsPhoto(result) ? 7 * 86400000 : retryMs) });
      }
      return result;
    });
    queue = task.then(() => {}, () => {});
    return task;
  };
}

export type PhotoCollector = (place: Place, signal?: AbortSignal) => Promise<Place>;
// A page is at most nine places, including those already carrying official photos.
export async function collectPhotoPage(places: readonly Place[], collect: PhotoCollector,
  onPhoto: (place: Place) => void, signal: AbortSignal): Promise<void> {
  const seen = new Set<string>();
  for (const place of places.slice(0, 9)) {
    if (signal.aborted) return;
    if (!needsPhoto(place) || place.id.startsWith('demo-') || seen.has(place.id)) continue;
    seen.add(place.id);
    try {
      const updated = await collect(place, signal);
      if (signal.aborted) return;
      if (updated.id === place.id && updated.image) onPhoto(updated);
    } catch { /* Continue to the next place if a single lookup fails. */ }
  }
}
