export const dogSizes = { SMALL: '소형', MEDIUM: '중형', LARGE: '대형' } as const;
export type DogSize = keyof typeof dogSizes;
export type DogInput = {
  name: string;
  size: DogSize;
  age: number | null;
  walkMinutes: number;
};
export type DogProfile = DogInput & { id: string; publicProfile: boolean };
export type PublicDog = Pick<DogProfile, 'name' | 'size'>;

export class AccountRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function accountApi<T>(path: string, method = 'GET', body?: DogInput | { publicProfile: boolean }, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    method, signal, credentials: 'same-origin',
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Auth-Client': 'web' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = response.status === 404 ? '볼 수 있는 반려견 프로필이 없어요.'
      : error.message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
    throw new AccountRequestError(response.status, message);
  }
  return response.status === 204 ? undefined as T : response.json();
}
