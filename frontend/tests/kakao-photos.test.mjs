import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchKakaoPlace, searchKakaoPlace, createPhotoCollector } from '../src/kakao-photos.ts';
import { photoCredit, photoPage, sourceLabel } from '../src/lib.ts';

const place = { id: 'csv-01234567890123456789', name: '테스트 카페', address: '서울특별시 종로구 인사동길 11', longitude: '126.986787', latitude: '37.57182943', image: '', source: 'xlsx' };
const candidate = { id: '123456', place_name: '테스트 카페', road_address_name: '서울 종로구 인사동길 11', address_name: '서울 종로구 인사동 1', x: place.longitude, y: place.latitude };
const photo = { ...place, image: 'https://t1.kakaocdn.net/local/kakaomapPhoto/review/photo.jpg', imageSource: 'kakao', imagePage: 'https://place.map.kakao.com/123456', imageCollectedAt: '2026-11-14T00:00:00Z' };

test('matches exact business names with canonical addresses or nearby valid coordinates', () => {
  assert.equal(matchKakaoPlace(place, [candidate]), candidate);
  assert.equal(matchKakaoPlace({ ...place, longitude: '', latitude: '' }, [candidate]), candidate);
  assert.equal(matchKakaoPlace({ ...place, address: '다른 표기 주소' }, [candidate]), candidate);
  assert.equal(matchKakaoPlace(place, [{ ...candidate, place_name: '다른 카페' }]), null);
  assert.equal(matchKakaoPlace(place, [{ ...candidate, road_address_name: '부산 다른길 20', x: '129.1', y: '35.1' }]), null);
  assert.equal(matchKakaoPlace(place, [candidate, { ...candidate, id: '123457' }]), null);
  assert.equal(matchKakaoPlace(place, [candidate, candidate]), candidate);
});
test('SDK zero results and timeouts resolve without disrupting the place display', async () => {
  const maps = { services: { Status: { OK: 'OK' }, Places: class { keywordSearch(query, callback) { callback([], 'ZERO_RESULT'); } } } };
  assert.equal(await searchKakaoPlace(place, maps), null);
  maps.services.Places = class { keywordSearch() {} };
  assert.equal(await searchKakaoPlace(place, maps, 5), null);
});
test('registry search uses the map province name and omits building details', async () => {
  let searched = '';
  const maps = { services: { Status: { OK: 'OK' }, Places: class {
    keywordSearch(query, callback) {
      searched = query;
      callback([], 'ZERO_RESULT');
    }
  } } };
  await searchKakaoPlace({ ...place, longitude: '', latitude: '', address: '전남광주통합특별시 북구 테스트로 11(1층)' }, maps);
  assert.equal(searched, '광주 북구 테스트로 11 테스트 카페');
});
test('deduplicates photo requests, preserves source data, and caches failures', async () => {
  let lookups = 0, requests = 0;
  const collect = createPhotoCollector(async () => { lookups++; return candidate; }, async (url, options) => {
    if (url.endsWith('/photo')) return { ok: true, json: async () => ({ status: 'search-required', place }) };
    requests++;
    assert.equal(url, `/api/places/${place.id}/kakao-photo`);
    assert.equal(JSON.parse(options.body).id, candidate.id);
    return { ok: true, json: async () => ({ status: 'collected', place: photo }) };
  });
  const [a, b] = await Promise.all([collect(place), collect(place)]);
  assert.equal(a.image, photo.image); assert.equal(b.imagePage, photo.imagePage);
  assert.equal(a.source, 'xlsx'); assert.equal(lookups, 1); assert.equal(requests, 1);
  assert.equal((await collect({ ...place, latitude: '37.57' })).latitude, '37.57');
  let failures = 0;
  const unavailable = createPhotoCollector(async () => candidate, async () => { failures++; throw Error('offline'); });
  assert.equal((await unavailable(place)).image, '');
  assert.equal((await unavailable(place)).image, '');
  assert.equal(failures, 1);
});
test('serializes network collection and never replaces an existing photo', async () => {
  let active = 0, maximum = 0;
  const collect = createPhotoCollector(async () => candidate, async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { ok: false };
  });
  await Promise.all([collect(place), collect({ ...place, id: 'csv-22222222222222222222' })]);
  assert.equal(maximum, 1);
  assert.equal(await collect(photo), photo);
});
test('credits Kakao separately from the dataset and links only to a validated place page', () => {
  assert.equal(sourceLabel(photo), '반려동물 동반가능 업소현황');
  assert.equal(photoCredit(photo), '사진: 카카오맵');
  assert.equal(photoPage(photo), photo.imagePage);
  assert.equal(photoPage({ ...photo, imagePage: 'javascript:alert(1)' }), undefined);
  assert.equal(photoPage({ ...photo, imagePage: 'https://place.map.kakao.com.evil.test/123' }), undefined);
});

test('server checks public photos before Kakao and does not require the browser map SDK', async () => {
  const official = { ...place, image: 'https://tong.visitkorea.or.kr/official.jpg', imageSource: 'tourapi' };
  let calls = 0;
  const collect = createPhotoCollector(async () => { assert.fail('Do not load the map SDK when the server resolved a photo'); }, async (url, options) => {
    calls++; assert.equal(url, `/api/places/${place.id}/photo`); assert.equal(options.method, 'POST');
    return { ok: true, json: async () => ({ status: 'available', place: official }) };
  });
  const result = await collect(place);
  assert.equal(result.image, official.image); assert.equal(result.imageSource, 'tourapi');
  assert.equal((await collect(place)).image, official.image); assert.equal(calls, 1);
});

test('server-collected Kakao photos retain provenance and ambiguous matches stay blank', async () => {
  const collect = createPhotoCollector(async () => { assert.fail('Server resolved the lookup'); }, async () => ({ ok: true, json: async () => ({ status: 'collected', place: photo }) }));
  assert.equal((await collect(place)).imagePage, photo.imagePage);
  const unmatched = createPhotoCollector(async () => { assert.fail('Do not repeat ambiguous searches'); }, async () => ({ ok: true, json: async () => ({ status: 'unmatched', place }) }));
  assert.equal((await unmatched(place)).image, '');
});
