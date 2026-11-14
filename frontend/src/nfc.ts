export type NfcState = {
  active: boolean; petName: string; tagId: string; date: string; millisToday: number; pointsToday: number;
  serverNow: number; activeUntil: number; resetAt: number; sessionStartedAt: number;
};
export type Points = { total: number; history: { reason: string; amount: number; createdAt: string; target: string }[]; nfc: NfcState };
export const NFC_DAY_MS = 86_400_000;
export const NFC_DAILY_LIMIT = 100;

// Interpolate only inside the server-confirmed connection lease and calendar day.
export function projectNfc(points: Points, elapsed: number) {
  const nfc = points.nfc;
  const delta = nfc.active ? Math.max(0, Math.min(elapsed, nfc.activeUntil - nfc.serverNow, nfc.resetAt - nfc.serverNow)) : 0;
  const millisToday = Math.min(NFC_DAY_MS, nfc.millisToday + delta);
  const pointsToday = Math.min(NFC_DAILY_LIMIT, millisToday * NFC_DAILY_LIMIT / NFC_DAY_MS);
  return {
    total: points.total + Math.max(0, pointsToday - nfc.pointsToday), pointsToday, millisToday,
    active: nfc.active && elapsed < nfc.activeUntil - nfc.serverNow,
    sessionMillis: nfc.sessionStartedAt ? Math.max(0, nfc.serverNow - nfc.sessionStartedAt + delta) : 0,
  };
}
export function proximityDuration(millis: number) {
  const seconds = Math.floor(Math.max(0, millis) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
}
export function pointNumber(value: number) {
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
