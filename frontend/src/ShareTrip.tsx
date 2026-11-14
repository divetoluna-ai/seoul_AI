import { useEffect, useRef, useState } from 'react';
import type { Place } from './lib';
import { communityApi } from './community-api';
import { deliverTripLink } from './share';
import { useMemberProfile } from './MemberProfile';
import { profileComplete } from './member-profile';

export default function ShareTrip({ stops, loggedIn }: { stops: Place[]; loggedIn: boolean }) {
  const { profile, openProfile } = useMemberProfile();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [link, setLink] = useState('');
  const [shareId, setShareId] = useState('');
  const [retryId, setRetryId] = useState('');
  useEffect(() => { if (!loggedIn) { setLink(''); setRetryId(''); setMessage(''); setLoginRequired(false); } }, [loggedIn]);
  async function reward(id: string) {
    setRetryId(id);
    await communityApi<{ total: number; awarded: number }>(`/shares/${id}/complete`, 'PUT');
    setRetryId('');
    setMessage('공유했어요.');
  }
  async function share() {
    if (!loggedIn) { setMessage('로그인 후 공유할 수 있어요.'); return; }
    if (!profileComplete(profile)) { setLoginRequired(true); openProfile(); return; }
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(''); setLoginRequired(false); setLink(''); setRetryId('');
    let delivered = false;
    try {
      // Resolve the session before preparing a link; anonymous users cannot earn points.

      const result = await communityApi<{ id: string }>('/shares', 'POST', {
        stops: stops.map(({ id, name, address, category, latitude, longitude }) => ({ id, name, address, category, latitude, longitude })),
      });
      const url = new URL(window.location.href); url.search = ''; url.hash = `trip=${result.id}`;
      const value = url.toString(); setLink(value); setShareId(result.id);
      const delivery = await deliverTripLink(value, navigator);
      if (delivery === 'cancelled') { setMessage('공유를 취소했어요.'); return; }
      if (delivery === 'unsupported') { setMessage('이 브라우저에서는 자동 공유를 지원하지 않아요. 아래 링크를 복사해 공유해주세요.'); return; }
      delivered = true;
      await reward(result.id);
    } catch (e) { setMessage(delivered ? '공유 결과를 저장하지 못했어요. 다시 시도해주세요.' : (e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="trip-share">
    <button className="trip-add" disabled={!loggedIn || busy || !stops.length} onClick={() => void share()}>{busy ? '공유 준비 중…' : '지도·코스 공유하기'}</button>
    {!loggedIn && <p>지도·코스 공유는 로그인 후 이용할 수 있어요.</p>}
    <small>함께 가고 싶은 지도·코스를 공유해보세요. 현재 위치는 공유하지 않아요.</small>
    {loginRequired && !profileComplete(profile) && <p role="status"><button onClick={openProfile}>프로필 설정</button>에서 닉네임과 반려견을 등록해주세요.</p>}
    {message && <p role="status">{message}</p>}
    {loggedIn && link && <><label>공유 링크<input readOnly value={link} onFocus={e => e.target.select()}/></label><button disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        if (!navigator.clipboard) { setMessage('이 브라우저는 링크 자동 복사를 지원하지 않아요.'); return; }
        await navigator.clipboard.writeText(link); await reward(shareId);
      } catch { setMessage('링크 복사 또는 공유 저장을 완료하지 못했어요. 다시 시도해주세요.'); }
      finally { setBusy(false); }
    }}>링크 복사하기</button></>}
    {loggedIn && retryId && <button disabled={busy} onClick={async () => { setBusy(true); try { await reward(retryId); } catch { setMessage('공유 결과를 저장하지 못했어요. 다시 시도해주세요.'); } finally { setBusy(false); } }}>공유 결과 저장 다시 시도</button>}
  </div>;
}
