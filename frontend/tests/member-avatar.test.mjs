import test from 'node:test';
import assert from 'node:assert/strict';
import { registeredAvatarPets, memberAvatarKey, GUEST_AVATAR_KEY, requestAvatarDesign } from '../src/member-avatar.ts';

test('avatar uses registered names, removes duplicates and omits unnamed legacy dogs', () => {
  const pets = registeredAvatarPets({ id: 'profile-1', petName: ' 보리 ' }, [
    { id: 'dog-1', name: '보리' }, { id: 'dog-2', name: '콩이' }, { id: 'legacy', name: null },
  ]);
  assert.deepEqual(pets, [
    { id: 'profile:profile-1', name: '보리', source: 'profile' },
    { id: 'dog:dog-2', name: '콩이', source: 'dog' },
  ]);
  assert.deepEqual(registeredAvatarPets(null, null), []);
});

test('renaming a registered pet preserves its saved room identity', () => {
  for (const source of ['profile', 'dog']) {
    const pets = name => registeredAvatarPets(
      source === 'profile' ? { id: 'p1', petName: name } : null,
      source === 'dog' ? [{ id: 'd1', name }] : null,
    );
    const before = pets('보리')[0], after = pets('보리 수정')[0];
    assert.equal(after.name, '보리 수정');
    assert.equal(memberAvatarKey('member-1', before.id), memberAvatarKey('member-1', after.id));
  }
});

test('design storage separates accounts, pets and guests', () => {
  const keys = [memberAvatarKey('member-1', 'dog:1'), memberAvatarKey('member-2', 'dog:1'),
    memberAvatarKey('member-1', 'dog:2'), memberAvatarKey(null, null)];
  assert.equal(new Set(keys).size, 4);
  assert.equal(keys[3], GUEST_AVATAR_KEY);
  assert.notEqual(memberAvatarKey('a:pet:b', 'c'), memberAvatarKey('a', 'b:pet:c'));
});

test('server design requests restore JSON and save with the authenticated browser session', async () => {
  const design = { name: '보리', outfitId: 'shirt', furniture: [{ id: 'bed', x: 1 }] };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ design }), { status: 200 });
  };
  assert.deepEqual(await requestAvatarDesign('dog:123', { fetcher }), { design });
  await requestAvatarDesign('dog:123', { design, fetcher, keepalive: true });
  assert.equal(calls[0].url, '/api/auth/avatar?pet=dog%3A123');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].options.headers['X-Auth-Client'], 'web');
  assert.deepEqual(JSON.parse(calls[1].options.body), design);
  assert.equal(calls[1].options.keepalive, true);
});

test('an absent server design is distinct from a failed load or failed save', async () => {
  const missing = async () => new Response('{"design":null}', { status: 200 });
  assert.deepEqual(await requestAvatarDesign('dog:123', { fetcher: missing }), { design: null });
  const failed = async () => new Response('{}', { status: 503 });
  await assert.rejects(requestAvatarDesign('dog:123', { fetcher: failed }), /불러오지 못했어요/);
  await assert.rejects(requestAvatarDesign('dog:123', { design: {}, fetcher: failed }), /저장하지 못했어요/);
});
