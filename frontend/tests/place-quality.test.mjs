import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedPlace } from '../src/place-quality.ts';
import { loadSaved, sourceLabel } from '../src/lib.ts';
import { loadTrip } from '../src/trip.ts';

test('browser eligibility rules match the canonical server rules', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../src/place-quality-rules.json', import.meta.url))),
    JSON.parse(readFileSync(new URL('../../backend/src/main/resources/data/place-quality-rules.json', import.meta.url))));
});
test('unrelated businesses and broken names are excluded without dropping legitimate scenic names or short brands', () => {
  for (const name of ['가나안경원 명동점', '강남엔비의원', '네일스튜디오', '휴대폰 대리점']) assert.equal(isAllowedPlace({ name, category: 'shopping' }), false);
  for (const name of ['?커피,MOCC', '카페 �', '---', '테스트', '1234567890']) assert.equal(isAllowedPlace({ name, category: 'restaurant' }), false);
  for (const [name, category] of [['큰엉해안경승지', 'attraction'], ['반계리 은행나무', 'attraction'], ['핑퐁커피 경대병원점', 'restaurant'], ['프렌즈애견펜션', 'stay'], ['닷', 'restaurant'], ['1938', 'restaurant'], ['2Cats', 'restaurant'], ['프렌즈 애견미용실', 'shopping']]) assert.equal(isAllowedPlace({ name, category }), true, name);
  assert.equal(sourceLabel({ source: 'supplemental' }), '추가 반려동물 동반 CSV');
});
test('old favorites and saved courses no longer restore excluded places', () => {
  const original = globalThis.localStorage;
  const common = { address: '서울', latitude: '37.57', longitude: '126.98', image: '' };
  const good = { ...common, id: '1', name: '카페 정원', category: 'restaurant' };
  globalThis.localStorage = { getItem: () => JSON.stringify([good, { ...common, id: '2', name: '가나안경원', category: 'shopping' }, { ...common, id: '3', name: '?커피', category: 'restaurant' }]) };
  try { assert.deepEqual(loadSaved().map(p => p.id), ['1']); assert.deepEqual(loadTrip().map(p => p.id), ['1']); }
  finally { globalThis.localStorage = original; }
});
