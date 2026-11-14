import type { Place } from './lib.ts';
import { coordinatesOf, MAX_STOPS } from './trip.ts';

export type Profile = { id: string; nickname: string; petName: string };
export type SharedCourse = { id: string; title: string; content: string; region: string; stops: Place[]; createdAt: string; updatedAt: string };
export type CourseView = { course: SharedCourse; author: Profile; likeCount: number; mine: boolean; liked: boolean };
export type CourseFeed = { items: CourseView[]; total: number; page: number; pageSize: number };
export async function communityApi<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/community${path}`, { method, credentials: 'same-origin', signal,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Community-Client': 'web' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    if (response.status === 401 && response.headers.get('X-Auth-Required') === '1') window.dispatchEvent(new Event('auth-session-expired'));
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
  }
  const result = response.status === 204 ? undefined as T : await response.json();
  if (method !== 'GET' && path !== '/nfc/heartbeat') window.dispatchEvent(new Event('community-points-changed'));
  return result;
}
export function communityDate(date: string) {
  return new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}
export function isCommunityHash(hash: string) { return hash === '#community' || hash.startsWith('#community/course/'); }
export function courseIdFromHash(hash: string) {
  return /^#community\/course\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(hash)?.[1] || '';
}
export function courseShareUrl(id: string, href: string) {
  if (!courseIdFromHash(`#community/course/${id}`)) throw new Error('공유할 코스를 확인해주세요.');
  const url = new URL(href); url.hash = `community/course/${id}`; return url.toString();
}
export function courseInput(title: string, content: string, region: string, stops: Place[]) {
  if (stops.length < 2 || stops.length > MAX_STOPS) throw new Error(`공유할 코스에 장소를 2~${MAX_STOPS}곳 담아주세요.`);
  if (new Set(stops.map(p => p.id)).size !== stops.length) throw new Error('같은 장소는 한 번만 담아주세요.');
  const entries = stops.map(p => {
    if (!/^(?:[0-9]{1,20}|csv-[a-f0-9]{20})$/.test(p.id) || !coordinatesOf(p)) throw new Error('장소의 위치를 확인한 뒤 공유해주세요.');
    return { id: p.id, latitude: p.latitude, longitude: p.longitude };
  });
  return { title: title.trim(), content: content.trim(), region, stops: entries };
}
