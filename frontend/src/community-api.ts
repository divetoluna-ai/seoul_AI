export const communityCategories = { all: '전체 이야기', info: '정보 공유', walk: '산책·동네 모임', market: '중고·나눔' };
export type CommunityCategory = 'info' | 'walk' | 'market';
export type Profile = { id: string; nickname: string; petName: string; region: string; district: string };
export type CommunityPost = { id: string; category: CommunityCategory; title: string; content: string; region: string; district: string; tradeType: string; price: number | null; image: string; meetingAt: string; meetingPlace: string; capacity: number; status: string; createdAt: string };
export type PostView = { post: CommunityPost; author: Profile; commentCount: number; likeCount: number; participantCount: number; mine: boolean; liked: boolean; joined: boolean };
export type PostDetail = { item: PostView; comments: { comment: { id: string; content: string; createdAt: string }; author: Profile; mine: boolean }[] };
export type Feed = { items: PostView[]; total: number; page: number; pageSize: number };
export type Conversation = { id: string; postId: string; title: string; neighbor: Profile; lastMessage: string; updatedAt: string };
export type ConversationDetail = { conversation: Conversation; messages: { message: { id: string; content: string; createdAt: string }; mine: boolean }[] };
export async function communityApi<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/community${path}`, { method, credentials: 'same-origin', signal,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Community-Client': 'web' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
  }
  return response.status === 204 ? undefined as T : response.json();
}
export function communityDate(date: string) {
  return new Date(date).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function postStatus(post: CommunityPost) {
  if (post.category === 'info') return '동네 정보';
  if (post.category === 'market') return { open: '거래 가능', reserved: '예약 중', done: '거래 완료' }[post.status] || '거래 가능';
  return post.status === 'done' || new Date(post.meetingAt).getTime() <= Date.now() ? '모집 마감' : '이웃 모집 중';
}
export function postPrice(post: CommunityPost) { return post.tradeType === 'share' ? '무료 나눔' : `${(post.price || 0).toLocaleString('ko-KR')}원`; }

export async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG·PNG·WebP 사진을 선택해주세요.');
  if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하 사진을 선택해주세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d'); if (!context) throw new Error('사진을 처리하지 못했어요.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4]) { const result = canvas.toDataURL('image/jpeg', quality); if (result.length <= 680000) return result; }
    throw new Error('사진이 너무 커요. 더 작은 사진을 선택해주세요.');
  } finally { URL.revokeObjectURL(url); }
}
