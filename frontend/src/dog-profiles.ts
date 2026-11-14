export type DogInput = {
  name: string;
  walkMinutes: number;
};
export type DogProfile = {
  id: string;
  name: string | null;
  walkMinutes: number | null;
};

export function dogProfileLabel(dog: DogProfile) {
  const time = dog.walkMinutes == null ? '선호 시간 미등록' : `선호 ${dog.walkMinutes}분`;
  return dog.name ? `${dog.name} · ${time}` : time;
}

export class AccountRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function accountApi<T>(path: string, method = 'GET', body?: DogInput, signal?: AbortSignal): Promise<T> {
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
