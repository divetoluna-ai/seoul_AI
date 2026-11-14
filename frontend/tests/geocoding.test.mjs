import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceLocator, geocodingAddress, resolvePlaceCoordinates } from '../src/geocoding.ts';

const place = { id: 'csv-new', name: '새 카페', address: '서울특별시 마포구 성미산로29길 17-8(1층 연남동)', latitude: '', longitude: '', source: 'xlsx' };
function sdk(callback) {
  return { services: { Geocoder: class { addressSearch(address, done, options) { callback(address, done, options); } }, Status: { OK: 'OK' }, AnalyzeType: { EXACT: 'exact' } } };
}

test('address lookup strips floor information and supports the registry combined province label', () => {
  assert.equal(geocodingAddress(place.address), '서울특별시 마포구 성미산로29길 17-8');
  assert.equal(geocodingAddress('전남광주통합특별시 북구 용봉택지로 62(1층)'), '광주광역시 북구 용봉택지로 62');
  assert.equal(geocodingAddress('전남광주통합특별시 여수시 웅천중앙로 125'), '전라남도 여수시 웅천중앙로 125');
});

test('existing verified coordinates do not make a geocoder request', async () => {
  const located = { ...place, latitude: '37.5665', longitude: '126.978' };
  assert.equal(await resolvePlaceCoordinates(located, sdk(() => assert.fail('must reuse existing coordinates'))), located);
});

test('a unique exact-address result enriches only coordinates and preserves source and address', async () => {
  const result = await resolvePlaceCoordinates(place, sdk((address, done, options) => {
    assert.equal(address, geocodingAddress(place.address));
    assert.equal(options.analyze_type, 'exact');
    done([{ x: '126.978', y: '37.5665' }], 'OK');
  }));
  assert.equal(result.source, 'xlsx');
  assert.equal(result.address, place.address);
  assert.equal(result.latitude, '37.5665');
  assert.equal(result.longitude, '126.978');
  assert.equal(place.latitude, '');
});

test('missing, ambiguous and invalid positions are rejected instead of inventing a route stop', async () => {
  for (const results of [[], [{ x: '0', y: '0' }], [{ x: '126.978', y: '37.5665' }, { x: '127.1', y: '37.6' }]]) {
    await assert.rejects(resolvePlaceCoordinates(place, sdk((_address, done) => done(results, 'OK'))), /위치가 명확하지/);
  }
  await assert.rejects(resolvePlaceCoordinates(place, sdk((_address, done) => done([], 'ZERO_RESULT'))), /정확한 주소/);
});

test('a timeout rejects and ignores any late address response', async () => {
  let late;
  await assert.rejects(resolvePlaceCoordinates(place, sdk((_address, done) => { late = done; }), 5), /지연/);
  assert.doesNotThrow(() => late([{ x: '126.978', y: '37.5665' }], 'OK'));
});

test('detail and itinerary lookups share a request while preserving each record identity', async () => {
  let calls = 0, finish;
  const locate = createPlaceLocator(async () => sdk((_address, done) => { calls++; finish = done; }));
  const detail = locate(place);
  const otherPlace = { ...place, id: 'csv-other', name: '다른 업소', source: 'csv+xlsx' };
  const itinerary = locate(otherPlace);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish([{ x: '126.978', y: '37.5665' }], 'OK');
  const [first, second] = await Promise.all([detail, itinerary]);
  assert.equal(first.id, place.id);
  assert.equal(second.id, otherPlace.id);
  assert.equal(second.name, otherPlace.name);
  assert.equal(second.source, 'csv+xlsx');
  assert.equal(second.longitude, '126.978');
  await locate(place);
  assert.equal(calls, 1);
});

test('failed detail address lookups remain retryable', async () => {
  let calls = 0;
  const locate = createPlaceLocator(async () => sdk((_address, done) => {
    calls++;
    if (calls === 1) done([], 'ZERO_RESULT');
    else done([{ x: '126.978', y: '37.5665' }], 'OK');
  }));
  await assert.rejects(locate(place));
  assert.equal((await locate(place)).latitude, '37.5665');
  assert.equal(calls, 2);
});
