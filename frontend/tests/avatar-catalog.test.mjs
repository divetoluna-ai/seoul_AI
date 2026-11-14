import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { BREEDS, OUTFITS, findBreed, breedById } from '../src/avatar-catalog.ts';

test('breed input accepts Korean and English aliases with spacing and case, keeping species separate', () => {
 assert.equal(findBreed('  웰시 코기  ', 'dog')?.id, 'corgi');
 assert.equal(findBreed('Golden Retriever', 'dog')?.id, 'retriever');
 assert.equal(findBreed('러시안블루', 'cat')?.id, 'russian-blue');
 assert.equal(findBreed('Scottish-Fold', 'cat')?.id, 'scottish-fold');
 assert.equal(findBreed('푸들', 'cat'), undefined);
 assert.equal(findBreed('존재하지 않는 품종', 'dog'), undefined);
 assert.equal(findBreed('', 'dog'), undefined);
});
test('breed geometry distinguishes short legs, long bodies, ear shapes and coat styles', () => {
 assert.ok(breedById('corgi','dog').leg < breedById('retriever','dog').leg);
 assert.ok(breedById('dachshund','dog').length > breedById('maltese','dog').length);
 assert.equal(breedById('poodle','dog').coat, 'curly');
 assert.equal(breedById('scottish-fold','cat').ears, 'folded');
 assert.equal(breedById('siamese','cat').pattern, 'points');
 assert.equal(breedById('poodle','cat').id, 'mix-cat');
 assert.ok(BREEDS.every(b => b.species === 'dog' || b.species === 'cat'));
});
test('ten wardrobe products have distinct IDs, original links and bundled reference thumbnails', () => {
 assert.equal(OUTFITS.length, 10);
 assert.equal(new Set(OUTFITS.map(o=>o.id)).size,10);
 assert.equal(new Set(OUTFITS.map(o=>o.url)).size,10);
 for (const outfit of OUTFITS) {
  assert.equal(new URL(outfit.url).hostname, 'adorable-dog.com');
  assert.ok(existsSync(new URL('../public'+outfit.image,import.meta.url)));
 }
});
