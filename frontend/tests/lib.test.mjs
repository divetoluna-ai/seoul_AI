import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeImage, loadSaved, mapUrl, directionsUrl, sourceLabel, updatedDate, photoCredit, photosFirst } from '../src/lib.ts';
test('rejects executable and malformed image URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//bad.test/img', '/other']) {
    assert.equal(safeImage(url), '/images/placeholder.svg');
  }
  assert.equal(safeImage('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});
test('photos appear first without changing the order within each group or mutating saved places', () => {
  const places = [
    { id: 'a', image: '' }, { id: 'b', image: 'https://example.com/official.jpg', imageSource: 'tourapi' },
    { id: 'c', image: '/images/placeholder.svg' }, { id: 'd', image: 'https://t1.kakaocdn.net/local/kakaomapPhoto/review/1.jpg', imageSource: 'kakao' },
  ];
  assert.deepEqual(photosFirst(places).map(p => p.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(places.map(p => p.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(photosFirst(places.map(p => p.id === 'a' ? { ...p, image: 'https://example.com/new.jpg' } : p)).map(p => p.id), ['a', 'b', 'd', 'c']);
});
test('recovers from corrupt or unavailable browser storage', () => {
  globalThis.localStorage = { getItem: () => '{' };
  assert.deepEqual(loadSaved(), []);
  globalThis.localStorage = { getItem: () => '[null,{}, {"id":"1","name":"a","address":"b","image":"","category":"restaurant"}]' };
  assert.equal(loadSaved().length, 1);
  globalThis.localStorage = { getItem: () => { throw Error('blocked'); } };
  assert.deepEqual(loadSaved(), []);
});
test('places without coordinates open a Kakao search with the full name and address', () => {
  const url = mapUrl({ name: '카페 & 정원', address: '서울 #1' });
  assert.equal(new URL(url).origin, 'https://map.kakao.com');
  assert.equal(decodeURIComponent(url.split('/search/')[1]), '카페 & 정원 서울 #1');
});

test('Kakao location and directions links use latitude before longitude and escape place names', () => {
  const place = { id: 'csv-not-a-kakao-id', name: '카페 / 정원 & #1', address: '서울', latitude: '37.5665', longitude: '126.978' };
  assert.equal(mapUrl(place), `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},37.5665,126.978`);
  assert.equal(directionsUrl(place), `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},37.5665,126.978`);
  assert.ok(!mapUrl(place).includes(place.id));
});

test('missing, swapped and invalid coordinates never create a Kakao directions destination', () => {
  for (const coordinates of [{}, { latitude: '', longitude: '' }, { latitude: '126.978', longitude: '37.5665' }, { latitude: '0', longitude: '0' }]) {
    const place = { name: '새 업소', address: '서울 종로구', ...coordinates };
    assert.equal(directionsUrl(place), null);
    assert.ok(mapUrl(place).startsWith('https://map.kakao.com/link/search/'));
  }
});
test('CSV provenance and per-record dates stay distinct from live API', () => {
  assert.equal(sourceLabel({ source: 'csv' }), '한국문화정보원 CSV');
  assert.equal(sourceLabel({ source: 'tourapi' }), '한국관광공사 API');
  assert.equal(sourceLabel({ source: 'xlsx' }), '반려동물 동반가능 업소현황');
  assert.equal(sourceLabel({ source: 'csv+xlsx' }), '한국문화정보원 · 동반가능 업소현황');
  assert.equal(updatedDate({ modified: '2025-03-24' }), '2025.03.24');
  assert.equal(updatedDate({ modified: '20261112153000' }), '2026.11.12');
  assert.equal(updatedDate({ modified: '' }), '기준일 미제공');
});
test('merged photos credit the API while keeping CSV data attribution', () => {
  const merged = { source: 'csv', imageSource: 'tourapi', image: 'https://example.com/real.jpg' };
  assert.equal(sourceLabel(merged), '한국문화정보원 CSV');
  assert.equal(photoCredit(merged), '사진: 한국관광공사');
  assert.equal(photoCredit({ source: 'csv', image: '' }), '');
  assert.equal(photoCredit({ source: 'xlsx', image: 'https://example.com/photo.jpg' }), '');
});

test('allows only the exact local cached-photo route', () => {
  const path = '/api/places/photos/' + 'a'.repeat(64);
  assert.equal(safeImage(path), path);
  for (const invalid of [path + '?url=https://evil.test', path + '/extra', '/api/places/photos/../secret', '/api/places/photos/abc']) {
    assert.equal(safeImage(invalid), '/images/placeholder.svg');
  }
});
