import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectNfc, proximityDuration, NFC_DAY_MS } from '../src/nfc.ts';

const snapshot = (nfc = {}) => ({ total: 16, history: [], nfc: {
  active: true, petName: '보리', tagId: 'SIM-test', date: '2026-11-14', millisToday: 0, pointsToday: 0,
  serverNow: 100_000, activeUntil: 115_000, resetAt: 200_000, sessionStartedAt: 100_000, ...nfc,
} });
test('live proximity points are fractional and combine with existing activity points', () => {
  const live = projectNfc(snapshot(), 1000);
  assert.equal(live.millisToday, 1000);
  assert.ok(Math.abs(live.pointsToday - 100 / 86400) < 1e-10);
  assert.ok(Math.abs(live.total - 16 - 100 / 86400) < 1e-10);
  assert.equal(live.active, true);
  assert.equal(proximityDuration(3_661_000), '01:01:01');
});
test('the server lease bounds offline accrual and paused sessions never grow', () => {
  assert.equal(projectNfc(snapshot(), 60_000).millisToday, 15_000);
  assert.equal(projectNfc(snapshot(), 60_000).active, false);
  assert.equal(projectNfc(snapshot({ active: false }), 60_000).pointsToday, 0);
  assert.equal(projectNfc(snapshot(), -100).millisToday, 0);
});
test('interpolation cannot exceed the daily limit or cross a server day boundary', () => {
  const almost = NFC_DAY_MS - 1000;
  const state = snapshot({ millisToday: almost, pointsToday: almost * 100 / NFC_DAY_MS });
  assert.equal(projectNfc(state, 15_000).pointsToday, 100);
  assert.equal(projectNfc(state, 15_000).millisToday, NFC_DAY_MS);
  assert.equal(projectNfc(snapshot({ resetAt: 102_000 }), 10_000).millisToday, 2000);
});
