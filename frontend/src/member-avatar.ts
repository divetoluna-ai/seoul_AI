import type { DogProfile } from './dog-profiles';

export type AvatarPet = { id: string; name: string; source: 'profile' | 'dog' };
export const GUEST_AVATAR_KEY = 'daeng-avatar-studio-v1';

export function registeredAvatarPets(profile: { id: string; petName: string } | null, dogs: DogProfile[] | null): AvatarPet[] {
  const pets: AvatarPet[] = [];
  const name = profile?.petName.trim();
  if (profile && name) pets.push({ id: `profile:${profile.id}`, name, source: 'profile' });
  for (const dog of dogs ?? []) {
    const name = dog.name?.trim();
    if (name && !pets.some(pet => pet.name === name)) pets.push({ id: `dog:${dog.id}`, name, source: 'dog' });
  }
  return pets;
}

export function memberAvatarKey(memberId: string | null, petId: string | null): string {
  return memberId && petId
    ? `${GUEST_AVATAR_KEY}:member:${encodeURIComponent(memberId)}:pet:${encodeURIComponent(petId)}`
    : GUEST_AVATAR_KEY;
}

export async function requestAvatarDesign<T>(petId: string, options: {
  design?: T; signal?: AbortSignal; keepalive?: boolean; fetcher?: typeof fetch;
} = {}): Promise<{ design: T | null }> {
  const writing = Object.hasOwn(options, 'design');
  const response = await (options.fetcher ?? fetch)(`/api/auth/avatar?pet=${encodeURIComponent(petId)}`, {
    method: writing ? 'PUT' : 'GET', credentials: 'same-origin', signal: options.signal,
    keepalive: options.keepalive,
    headers: writing ? { 'Content-Type': 'application/json', 'X-Auth-Client': 'web' } : undefined,
    body: writing ? JSON.stringify(options.design) : undefined,
  });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('auth-session-expired'));
    throw new Error(response.status === 401 ? '로그인 후 아바타를 다시 열어주세요.'
      : writing ? '아바타를 저장하지 못했어요. 다시 저장해주세요.' : '저장한 아바타를 불러오지 못했어요. 다시 시도해주세요.');
  }
  return response.json();
}
