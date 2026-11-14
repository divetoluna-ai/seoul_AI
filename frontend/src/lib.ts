import { coordinatesOf } from './trip.ts';
import { isAllowedPlace } from './place-quality.ts';

export type Region = { code: string; name: string };
export type Place = { id: string; name: string; category: string; address: string; image: string; phone: string; longitude: string; latitude: string; modified: string; source?: string; imageSource?: string; imagePage?: string; imageCollectedAt?: string };
export type PlacesResponse = { items: Place[]; total: number; page: number; pageSize: number; mode: string; warning?: string };
export type Detail = { place: Place; overview: string; hours: string; restDay: string; parking: string; animals: string; requirements: string; facilities: string; other: string; mode: string };
export const categoryLabels: Record<string, string> = {
  all: '전체', attraction: '관광지', culture: '문화시설', festival: '축제·공연·행사',
  course: '여행코스', leisure: '레포츠', stay: '숙박', shopping: '쇼핑', restaurant: '음식점·카페', care: '미용·돌봄',
};
// Keep categories with more than 10 places in Seoul, plus accommodation.
export const browseCategories = ['all', 'attraction', 'stay', 'shopping', 'restaurant', 'care'] as const;
export function sourceLabel(place: Place) {
  if (place.source === 'supplemental') return '추가 반려동물 동반 CSV';
  if (place.source === 'xlsx') return '반려동물 동반가능 업소현황';
  if (place.source === 'csv+xlsx') return '한국문화정보원 · 동반가능 업소현황';
  return place.source === 'csv' ? '한국문화정보원 CSV' : '한국관광공사 API';
}
export function photoCredit(place: Place) {
  if (place.image && place.imageSource === 'kakao') return '사진: 카카오맵';
  return place.image && (place.imageSource === 'tourapi' || place.source === 'tourapi' || !place.source) ? '사진: 한국관광공사' : '';
}
export function photoPage(place: Place) {
  return place.imageSource === 'kakao' && /^https:\/\/place\.map\.kakao\.com\/[0-9]{1,20}$/.test(place.imagePage || '') ? place.imagePage : undefined;
}
export function updatedDate(place: Place) {
  const digits = (place.modified || '').replace(/[^0-9]/g, '');
  return digits.length >= 8 ? `${digits.slice(0,4)}.${digits.slice(4,6)}.${digits.slice(6,8)}` : '기준일 미제공';
}
export function categoryLabel(category: string) {
  return category === 'cafe' ? '카페' : categoryLabels[category] || '기타 장소';
}
export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  }
  return response.json();
}
export function safeImage(url: string) {
  return /^https?:\/\//i.test(url) || /^\/images\/place-[1-6]\.jpg$/.test(url) ? url : '/images/placeholder.svg';
}
export function photosFirst(places: Place[]) {
  const missing = (p: Place) => safeImage(p.image) === '/images/placeholder.svg';
  return [...places].sort((a, b) => Number(missing(a)) - Number(missing(b)));
}
type MapPlace = Pick<Place, 'name' | 'address'> & Partial<Pick<Place, 'latitude' | 'longitude'>>;
export function mapUrl(place: MapPlace) {
  const coordinate = coordinatesOf({ latitude: place.latitude || '', longitude: place.longitude || '' });
  return coordinate
    ? `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${coordinate.latitude},${coordinate.longitude}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(`${place.name} ${place.address}`.trim())}`;
}
export function directionsUrl(place: MapPlace): string | null {
  const coordinate = coordinatesOf({ latitude: place.latitude || '', longitude: place.longitude || '' });
  return coordinate ? `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${coordinate.latitude},${coordinate.longitude}` : null;
}
export function loadSaved(): Place[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem('daeng-places') || '[]');
    return Array.isArray(data) ? data.filter((p): p is Place => p && typeof p.id === 'string' && !p.id.startsWith('demo-') && typeof p.name === 'string' && typeof p.address === 'string' && typeof p.image === 'string' && isAllowedPlace(p)).slice(0, 200) : [];
  } catch { return []; }
}
