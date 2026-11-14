import type { Place } from './lib.ts';

export type Coordinate = { latitude: number; longitude: number };
export type RoadRoute = {
  coordinates: [number, number][];
  distance: number;
  duration: number;
  legs: { distance: number; duration: number }[];
};
export const MAX_STOPS = 8;
export const TRIP_STORAGE_KEY = 'daeng-trip-v1';

export function coordinatesOf(place: Pick<Place, 'latitude' | 'longitude'>): Coordinate | null {
  if (typeof place.latitude !== 'string' || typeof place.longitude !== 'string' ||
      !place.latitude.trim() || !place.longitude.trim()) return null;
  const latitude = Number(place.latitude), longitude = Number(place.longitude);
  // The catalog covers South Korea. Reject missing, swapped and out-of-coverage coordinates.
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= 32 && latitude <= 39.5 && longitude >= 124 && longitude <= 132
    ? { latitude, longitude } : null;
}

export function loadTrip(): Place[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(TRIP_STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data.filter((p): p is Place => {
      if (!p || typeof p.id !== 'string' || p.id.startsWith('demo-') || seen.has(p.id) ||
          typeof p.name !== 'string' || typeof p.address !== 'string' ||
          typeof p.category !== 'string' || typeof p.image !== 'string' || !coordinatesOf(p)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, MAX_STOPS);
  } catch { return []; }
}

export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}`;
}

export function routeKey(points: Coordinate[]) {
  return points.map(p => `${p.longitude},${p.latitude}`).join(';');
}

export async function fetchRoadRoute(points: Coordinate[], signal: AbortSignal, baseUrl = 'https://router.project-osrm.org'): Promise<RoadRoute> {
  if (points.length < 2 || points.length > MAX_STOPS + 1 || points.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude))) {
    throw new Error('경로를 표시할 장소를 두 곳 이상 선택해주세요.');
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/route/v1/driving/${routeKey(points)}?overview=full&geometries=geojson&steps=false&alternatives=false&radiuses=${points.map(() => '1000').join(';')}`, { signal });
  if (!response.ok) throw new Error('경로 서비스에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route) throw new Error('선택한 장소 사이의 자동차 경로를 찾지 못했어요. 섬 지역이나 차량 진입이 어려운 장소인지 확인해주세요.');
  if (!Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0 ||
      route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 ||
      route.geometry.coordinates.some((p: unknown) => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) ||
      !Array.isArray(route.legs) || route.legs.length !== points.length - 1 ||
      route.legs.some((leg: { distance: number; duration: number }) => !Number.isFinite(leg.distance) || leg.distance < 0 || !Number.isFinite(leg.duration) || leg.duration < 0)) {
    throw new Error('경로 정보를 확인하지 못했어요. 다시 시도해주세요.');
  }
  return { coordinates: route.geometry.coordinates, distance: route.distance, duration: route.duration, legs: route.legs };
}
