import { useCallback, useEffect, useRef, useState } from 'react';
import { PawPrint, Radio, Square } from 'lucide-react';
import { communityApi, communityDate, type Profile } from './community-api';
import { pointNumber, projectNfc, proximityDuration, type Points } from './nfc';
import './points.css';

const labels: Record<string, string> = { share: '지도·코스 공유', like: '좋아요', comment: '댓글 작성', nfc: 'NFC 근접 적립' };
export default function PointsPanel({ onEditProfile }: { onEditProfile?: () => void }) {
  const [points, setPoints] = useState<Points | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const receivedAt = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  const applyPoints = useCallback((value: Points) => { receivedAt.current = performance.now(); setElapsed(0); setPoints(value); }, []);
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener('community-points-changed', refresh);
    return () => window.removeEventListener('community-points-changed', refresh);
  }, []);
  useEffect(() => {
    const abort = new AbortController(); setError('');
    void (async () => {
      try {
        const data = await communityApi<{ profile: Profile | null }>('/profile', 'GET', undefined, abort.signal);
        if (abort.signal.aborted) return;
        setProfile(data.profile);
        if (data.profile) {
          const result = await communityApi<Points>('/points', 'GET', undefined, abort.signal);
          if (!abort.signal.aborted) applyPoints(result);
        } else setPoints(null);
      } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
    })();
    return () => abort.abort();
  }, [revision, applyPoints]);
  useEffect(() => {
    if (!points?.nfc.active || !profile) return;
    const abort = new AbortController();
    let pending = false;
    const heartbeat = async () => {
      if (pending) return;
      pending = true;
      try {
        const value = await communityApi<Points>('/nfc/heartbeat', 'POST', undefined, abort.signal);
        if (!abort.signal.aborted) { applyPoints(value); setError(''); }
      } catch (e) { if (!abort.signal.aborted) setError('적립 서버와 연결이 끊겼어요. 연결이 복구되면 상태를 확인해요.'); }
      finally { pending = false; }
    };
    const timer = setInterval(() => void heartbeat(), 5000);
    const visible = () => { if (document.visibilityState === 'visible') void heartbeat(); };
    document.addEventListener('visibilitychange', visible);
    return () => { abort.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [profile?.id, points?.nfc.active, applyPoints]);
  useEffect(() => {
    if (!points?.nfc.active) return;
    const timer = setInterval(() => setElapsed(Math.max(0, performance.now() - receivedAt.current)), 100);
    return () => clearInterval(timer);
  }, [points?.nfc.active]);
  async function toggleProximity() {
    if (busy) return;
    setBusy(true); setError('');
    try { applyPoints(await communityApi<Points>('/nfc/proximity', 'PUT', { enabled: !points?.nfc.active })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const live = points ? projectNfc(points, elapsed) : null;
  const nfc = points?.nfc;
  return <aside className="points-panel" aria-label="내 포인트">
    <div className="points-heading"><strong>{profile ? `${profile.nickname}님의 포인트` : '함께 나누고 포인트 받기'}</strong><span>{live ? `${pointNumber(live.total)} P` : '—'}</span></div>
    <p>지도·코스 공유 +10P · 좋아요 +1P · 댓글 +5P</p>
    <small>같은 코스 공유와 같은 글의 좋아요는 각각 한 번 적립돼요.</small>
    {!profile && !error && <a href="#community">커뮤니티에서 이웃 프로필을 만들면 적립할 수 있어요.</a>}
    <section className={`nfc-card ${live?.active ? 'nfc-active' : ''}`} aria-label="NFC 근접 적립 시뮬레이션">
      <div className="nfc-title"><strong><Radio size={18}/> 함께 있는 시간 적립</strong><span>가상 NFC · 시뮬레이션</span></div>
      <div className="nfc-pet"><span className="nfc-avatar" aria-hidden="true"><PawPrint size={28}/></span><div><strong>{nfc?.petName || profile?.petName || '등록한 반려동물'}</strong><small>{nfc?.petName ? `프로필 연결 태그 · ${nfc.tagId}` : '이웃 프로필에 반려동물 이름을 등록해주세요.'}</small></div><span className={`nfc-status ${live?.active ? 'active' : ''}`} role="status">{live?.active ? '3m 이내 · 적립 중' : '적립 대기'}</span></div>
      <p>실물 태그 없이 버튼으로 가까이 있는 상태를 가정해요.<br/>시간당 약 4.166P · 하루 최대 100P</p>
      <div className="nfc-metrics"><div><small>오늘 함께한 시간</small><strong>{proximityDuration(live?.millisToday || 0)}</strong></div><div><small>오늘 NFC 적립</small><strong>+{pointNumber(live?.pointsToday || 0)} <span>/ 100P</span></strong></div></div>
      <progress className="nfc-progress" max={100} value={live?.pointsToday || 0} aria-label="오늘 NFC 포인트 적립률"/>
      {nfc?.active && live && <small>이번 연결 {proximityDuration(live.sessionMillis)}{live.pointsToday >= 100 ? ' · 오늘 한도 도달, 다음 날 다시 적립돼요.' : ' · 가까이 있는 동안 포인트가 쌓여요.'}</small>}
      {profile && nfc?.petName ? <button className={`nfc-toggle ${nfc.active ? 'stop' : ''}`} disabled={busy || !points} onClick={() => void toggleProximity()}>{nfc.active ? <Square size={16}/> : <Radio size={16}/>} {busy ? '상태 변경 중…' : nfc.active ? '3m 밖으로 이동 (적립 중지)' : '3m 이내로 가정 (적립 시작)'}</button>
        : onEditProfile ? <button className="nfc-toggle" onClick={onEditProfile}>{profile ? '반려동물 이름 등록하기' : '이웃 프로필 만들기'}</button>
        : <a className="nfc-setup" href="#community">커뮤니티에서 프로필·반려동물 등록하기</a>}
      <small>한국 시간 자정에 일일 한도가 초기화돼요. 화면을 닫거나 연결이 끊기면 잠시 후 적립이 멈춰요.</small>
    </section>
    {error && <p role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>다시 시도</button></p>}
    {!!points?.history.length && <details><summary>최근 적립 내역</summary><ul>{points.history.map(entry => <li key={`${entry.reason}-${entry.target}`}><span>{labels[entry.reason] || entry.reason}<small>{entry.reason === 'nfc' ? `${entry.target} · 하루 합계` : communityDate(entry.createdAt)}</small></span><b>+{pointNumber(entry.amount)}P</b></li>)}</ul></details>}
  </aside>;
}
