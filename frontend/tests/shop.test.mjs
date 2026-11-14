import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredPoints, missingPoints, selectProducts } from '../src/shop.ts';
const products = [{id:'1',name:'하네스',priceWon:60000,soldOut:false},{id:'2',name:'고글',priceWon:10000,soldOut:false},{id:'3',name:'품절 옷',priceWon:5000,soldOut:true}];
test('one point equals one won; fractional balances cannot round up to afford an item', () => {
  assert.equal(requiredPoints(10000),10000);
  assert.equal(missingPoints(10000,9999.9),1);
  assert.equal(missingPoints(10000,10000.2),0);
});
test('affordability excludes sold-out items and unknown balances', () => {
  assert.deepEqual(selectProducts(products,'',true,10000,'default').map(p=>p.id),['2']);
  assert.deepEqual(selectProducts(products,'',true,null,'default'),[]);
});
test('search and price sort compose without changing source order', () => {
  assert.equal(selectProducts(products,'고글',false,null,'low').length,1);
  assert.deepEqual(selectProducts(products,'',false,null,'low').map(p=>p.id),['3','2','1']);
  assert.equal(products[0].id,'1');
});
