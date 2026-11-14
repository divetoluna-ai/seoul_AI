import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communityApi, courseInput, courseShareUrl, courseIdFromHash, isCommunityHash } from '../src/community-api.ts';

const id = '38e7cd50-2280-49f9-85e2-817017601d9e';
const stops = [
  { id: 'csv-01234567890123456789', name: '산책길', latitude: '37.56', longitude: '126.97', image: '', address: '서울' },
  { id: '123456', name: '카페', latitude: '37.57', longitude: '126.98', image: '', address: '서울' },
];
test('shared links keep the current server and identify a course on refresh', () => {
  const link = courseShareUrl(id, 'https://pet-tour.example/app/#explore');
  assert.equal(link, `https://pet-tour.example/app/#community/course/${id}`);
  assert.equal(courseIdFromHash(new URL(link).hash), id);
  assert.equal(isCommunityHash(new URL(link).hash), true);
  assert.equal(isCommunityHash('#community'), true);
  assert.equal(isCommunityHash('#explore'), false);
  assert.equal(courseIdFromHash('#community/course/javascript:alert(1)'), '');
  assert.throws(() => courseShareUrl('../private', 'https://pet-tour.example'));
});
test('course payload preserves visit order and sends catalog IDs rather than editable place names or current position', () => {
  const body = courseInput(' 느긋한 하루 ', ' 여행 소개입니다. ', '11', stops);
  assert.equal(body.title, '느긋한 하루'); assert.equal(body.content, '여행 소개입니다.');
  assert.deepEqual(body.stops, stops.map(p => ({ id: p.id, latitude: p.latitude, longitude: p.longitude })));
  assert.equal(JSON.stringify(body).includes('name'), false);
  assert.equal(JSON.stringify(body).includes('origin'), false);
  assert.deepEqual(courseInput('제목', '내용', '11', [...stops].reverse()).stops.map(p => p.id), [stops[1].id, stops[0].id]);
  assert.equal(stops[0].name, '산책길');
});
test('sharing rejects incomplete, duplicate and invalid location lists', () => {
  for (const invalid of [[], stops.slice(0, 1), Array(9).fill(stops[0]), [stops[0], stops[0]],
    [stops[0], { ...stops[1], latitude: '' }], [stops[0], { ...stops[1], longitude: 'NaN' }],
    [stops[0], { ...stops[1], id: 'demo-1' }], [stops[0], { ...stops[1], latitude: '126.98', longitude: '37.57' }]]) {
    assert.throws(() => courseInput('제목', '내용', '11', invalid));
  }
});
test('course publishing and deletion use session cookies and the same-origin request header', async () => {
  const original = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  let changes = 0;
  window.addEventListener('community-points-changed', () => changes++);
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, status: options.method === 'DELETE' ? 204 : 201, json: async () => ({ course: { id } }) }; };
  try {
    const body = courseInput('제목', '내용', '11', stops);
    assert.equal((await communityApi('/courses', 'POST', body)).course.id, id);
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.headers['X-Community-Client'], 'web');
    assert.deepEqual(JSON.parse(calls[0].options.body), body);
    assert.equal(await communityApi(`/courses/${id}`, 'DELETE'), undefined);
    assert.equal(calls[1].url, `/api/community/courses/${id}`);
    assert.equal(changes, 2, 'Course changes refresh the rewards panel');
    await communityApi('/nfc/heartbeat', 'POST');
    await communityApi('/profile');
    assert.equal(changes, 2, 'Heartbeats and reads do not trigger reward refresh loops');
  } finally { globalThis.fetch = original; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
});
