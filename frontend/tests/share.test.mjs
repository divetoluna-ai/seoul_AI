import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliverTripLink } from '../src/share.ts';

test('successful native sharing and clipboard copying qualify for rewards', async () => {
  const url = 'https://example.com/#trip=123';
  let received;
  assert.equal(await deliverTripLink(url, { share: async data => { received = data.url; } }), 'shared');
  assert.equal(received, url);
  assert.equal(await deliverTripLink(url, { clipboard: { writeText: async data => { received = data; } } }), 'copied');
  assert.equal(received, url);
});
test('cancelled and unsupported sharing do not qualify or silently copy', async () => {
  let copied = false;
  const result = await deliverTripLink('url', {
    share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); },
    clipboard: { writeText: async () => { copied = true; } },
  });
  assert.equal(result, 'cancelled'); assert.equal(copied, false);
  assert.equal(await deliverTripLink('url', {}), 'unsupported');
});
test('native permission failures fall back to clipboard; failed copies cannot earn points', async () => {
  assert.equal(await deliverTripLink('url', {
    share: async () => { throw new Error('no activation'); }, clipboard: { writeText: async () => {} },
  }), 'copied');
  await assert.rejects(deliverTripLink('url', { clipboard: { writeText: async () => { throw new Error('denied'); } } }), /denied/);
});
