import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { coordinatesOf, fetchRoadRoute, formatDistance, formatDuration, loadTrip, MAX_STOPS, routeKey } from '../src/trip.ts';

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; });
const place = (id = 'place-1') => ({ id, name: '식사와 커피', address: '서울 종로구', category: 'restaurant', image: '', latitude: '37.5665', longitude: '126.978' });
const points = [{ latitude: 37.5665, longitude: 126.978 }, { latitude: 37.5712, longitude: 126.9895 }];
const validRoute = () => ({ code: 'Ok', routes: [{ distance: 2100, duration: 340, geometry: { type: 'LineString', coordinates: [[126.978, 37.5665], [126.98, 37.567], [126.9895, 37.5712]] }, legs: [{ distance: 2100, duration: 340 }] }] });

test('missing, swapped and out-of-country coordinates never become map stops', () => {
  assert.deepEqual(coordinatesOf(place()), points[0]);
  for (const [latitude, longitude] of [['', ''], [' ', '126.9'], ['0', '0'], ['NaN', '127'], ['Infinity', '37'], ['127', '37'], ['90', '180'], [undefined, undefined]]) {
    assert.equal(coordinatesOf({ latitude, longitude }), null);
  }
});

test('restored trips preserve stop order while removing duplicates, missing coordinates and demo places', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify([null, {}, place('second'), place('first'), place('second'), place('demo-11-1'), { ...place('bad'), latitude: '' }]) };
  assert.deepEqual(loadTrip().map(p => p.id), ['second', 'first']);
  globalThis.localStorage = { getItem: () => JSON.stringify(Array.from({ length: 20 }, (_, i) => place(String(i)))) };
  assert.equal(loadTrip().length, MAX_STOPS);
});

test('unreadable or corrupt trip storage does not break the application', () => {
  for (const value of ['{', 'null', '{}', 'false']) {
    globalThis.localStorage = { getItem: () => value };
    assert.deepEqual(loadTrip(), []);
  }
  globalThis.localStorage = { getItem: () => { throw Error('denied'); } };
  assert.deepEqual(loadTrip(), []);
});

test('distance and time are shown in readable metric units', () => {
  assert.equal(formatDistance(240), '240 m');
  assert.equal(formatDistance(2100), '2.1 km');
  assert.equal(formatDuration(340), '6분');
  assert.equal(formatDuration(3600), '1시간');
  assert.equal(formatDuration(3700), '1시간 2분');
});

test('road requests keep longitude first and preserve the selected visit order', async () => {
  const controller = new AbortController();
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = url;
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => validRoute() };
  };
  const route = await fetchRoadRoute(points, controller.signal, 'https://routes.example.test/');
  assert.ok(requested.startsWith('https://routes.example.test/route/v1/driving/126.978,37.5665;126.9895,37.5712?'));
  assert.ok(requested.includes('geometries=geojson'));
  assert.ok(requested.includes('radiuses=1000;1000'));
  assert.equal(route.distance, 2100);
  assert.equal(route.coordinates.length, 3);
  assert.equal(route.legs.length, 1);
  assert.notEqual(routeKey(points), routeKey([...points].reverse()));
});

test('one-stop and oversized routes never call the external service', async () => {
  globalThis.fetch = async () => assert.fail('invalid routes must not make a request');
  for (const stops of [[], [points[0]], Array.from({ length: MAX_STOPS + 2 }, () => points[0])]) {
    await assert.rejects(fetchRoadRoute(stops, new AbortController().signal));
  }
});

test('no-road and network failures do not produce an invented straight-line route', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ code: 'NoRoute' }) });
  await assert.rejects(fetchRoadRoute(points, new AbortController().signal), /자동차 경로를 찾지 못했어요/);
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(fetchRoadRoute(points, new AbortController().signal), /경로 서비스에 연결하지 못했어요/);
});

test('malformed geometry, metrics and leg counts are rejected', async () => {
  const variants = [
    r => { r.geometry.coordinates = [[null, 37], [127, 38]]; },
    r => { r.geometry.coordinates = [[126, 37]]; },
    r => { r.distance = -1; },
    r => { r.duration = '300'; },
    r => { r.legs = []; },
    r => { r.legs[0].duration = -1; },
    r => { r.geometry.type = 'Point'; },
  ];
  for (const change of variants) {
    const body = validRoute();
    change(body.routes[0]);
    globalThis.fetch = async () => ({ ok: true, json: async () => body });
    await assert.rejects(fetchRoadRoute(points, new AbortController().signal), /경로 정보를 확인하지 못했어요/);
  }
});

test('cancelled requests propagate cancellation so old routes can be ignored', async () => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_url, { signal }) => { signal.throwIfAborted(); };
  await assert.rejects(fetchRoadRoute(points, controller.signal), { name: 'AbortError' });
});
