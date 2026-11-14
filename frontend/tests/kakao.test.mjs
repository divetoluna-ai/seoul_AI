import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKakaoLoader } from '../src/kakao.ts';

function environment() {
  const scripts = [];
  const browser = {};
  const document = {
    createElement: () => ({ onload: null, onerror: null, removed: false, remove() { this.removed = true; } }),
    head: { appendChild: script => scripts.push(script) },
  };
  const load = createKakaoLoader(() => ({ browser, document }), 100);
  const finish = () => {
    browser.kakao = { maps: { load(callback) { this.Map = function Map() {}; this.services = { Geocoder: function Geocoder() {} }; callback(); } } };
    scripts.at(-1).onload();
  };
  return { scripts, browser, load, finish, document };
}

test('an empty Kakao key never injects a script', async () => {
  const env = environment();
  await assert.rejects(env.load('  '), /지도 설정/);
  assert.equal(env.scripts.length, 0);
});

test('concurrent map mounts share one SDK load and wait for the SDK callback', async () => {
  const env = environment();
  const first = env.load('test-key');
  const second = env.load('test-key');
  assert.equal(first, second);
  assert.equal(env.scripts.length, 1);
  const source = new URL(env.scripts[0].src);
  assert.equal(source.origin, 'https://dapi.kakao.com');
  assert.equal(source.searchParams.get('autoload'), 'false');
  assert.equal(source.searchParams.get('libraries'), 'services');
  assert.equal(source.searchParams.get('appkey'), 'test-key');
  env.finish();
  assert.equal(await first, env.browser.kakao.maps);
  assert.equal(await second, env.browser.kakao.maps);
  assert.equal(env.scripts[0].onerror, null);
});

test('network or domain failures can be retried without a stuck rejected promise', async () => {
  const env = environment();
  const first = env.load('test-key');
  env.scripts[0].onerror();
  await assert.rejects(first, /불러오지 못했어요/);
  assert.equal(env.scripts[0].removed, true);
  const second = env.load('test-key');
  assert.equal(env.scripts.length, 2);
  env.finish();
  assert.equal(await second, env.browser.kakao.maps);
});

test('an already loaded SDK is reused without another network request', async () => {
  const env = environment();
  env.browser.kakao = { maps: { Map: function Map() {}, services: { Geocoder: function Geocoder() {} } } };
  assert.equal(await env.load('test-key'), env.browser.kakao.maps);
  assert.equal(env.scripts.length, 0);
});

test('an older map-only SDK still loads the services library required by registry addresses', async () => {
  const env = environment();
  env.browser.kakao = { maps: { Map: function Map() {} } };
  const result = env.load('test-key');
  assert.equal(env.scripts.length, 1);
  assert.equal(new URL(env.scripts[0].src).searchParams.get('libraries'), 'services');
  env.finish();
  assert.ok((await result).services.Geocoder);
});

test('a loaded script without a working Kakao SDK fails with a readable error', async () => {
  const env = environment();
  const pending = env.load('test-key');
  env.scripts[0].onload();
  await assert.rejects(pending, /불러오지 못했어요/);
  assert.equal(env.scripts[0].removed, true);
});

test('a silent SDK timeout is cleaned up and remains retryable', async () => {
  const env = environment();
  const load = createKakaoLoader(() => ({ browser: env.browser, document: env.document }), 5);
  await assert.rejects(load('test-key'), /불러오지 못했어요/);
  assert.equal(env.scripts[0].removed, true);
  const retried = load('test-key');
  env.finish();
  assert.equal(await retried, env.browser.kakao.maps);
});
