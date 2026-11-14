import { useRef, useState } from 'react';
import type { Place } from './lib';
import { communityApi, type Profile } from './community-api';
import { deliverTripLink } from './share';

export default function ShareTrip({ stops }: { stops: Place[] }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [link, setLink] = useState('');
  const [shareId, setShareId] = useState('');
  const [retryId, setRetryId] = useState('');
  async function reward(id: string) {
    setRetryId(id);
    const result = await communityApi<{ total: number; awarded: number }>(`/shares/${id}/complete`, 'PUT');
    setRetryId('');
    setMessage(result.awarded ? '공유했어요! 10P를 적립했어요.' : '공유했어요. 이미 적립한 코스예요.');
  }
  async function share() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(''); setLoginRequired(false); setLink(''); setRetryId('');
    let delivered = false;
    try {
      // Resolve the session before preparing a link; anonymous users cannot earn points.
      const { profile } = await communityApi<{ profile: Profile | null }>('/profile');
      if (!profile) { setLoginRequired(true); return; }
      const result = await communityApi<{ id: string }>('/shares', 'POST', {
        stops: stops.map(({ id, name, address, category, latitude, longitude }) => ({ id, name, address, category, latitude, longitude })),
      });
      const url = new URL(window.location.href); url.search = ''; url.hash = `trip=${result.id}`;
      const value = url.toString(); setLink(value); setShareId(result.id);
      const delivery = await deliverTripLink(value, navigator);
      if (delivery === 'cancelled') { setMessage('공유를 취소했어요. 포인트는 적립되지 않았어요.'); return; }
      if (delivery === 'unsupported') { setMessage('이 브라우저에서는 자동 공유를 지원하지 않아요. 아래 링크를 복사해 공유해주세요.'); return; }
      delivered = true;
      await reward(result.id);
    } catch (e) { setMessage(delivered ? '공유 후 적립을 확인하지 못했어요. 적립을 다시 시도해주세요.' : (e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="trip-share">
    <button className="trip-add" disabled={busy || !stops.length} onClick={() => void share()}>{busy ? '공유 준비 중…' : '지도·코스 공유하기 (+10P)'}</button>
    <small>공유 완료 또는 링크 복사 후 적립돼요. 현재 위치는 공유하지 않아요.</small>
    {loginRequired && <p role="status"><a href="#community">이웃 프로필을 먼저 만들어주세요.</a> 프로필을 만든 뒤 돌아와 공유할 수 있어요.</p>}
    {message && <p role="status">{message}</p>}
    {link && <><label>공유 링크<input readOnly value={link} onFocus={e => e.target.select()}/></label><button disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        if (!navigator.clipboard) { setMessage('이 브라우저는 링크 자동 복사를 지원하지 않아요.'); return; }
        await navigator.clipboard.writeText(link); await reward(shareId);
      } catch { setMessage('링크 복사 또는 적립을 완료하지 못했어요. 다시 시도해주세요.'); }
      finally { setBusy(false); }
    }}>링크 복사하고 포인트 받기</button></>}
    {retryId && <button disabled={busy} onClick={async () => { setBusy(true); try { await reward(retryId); } catch { setMessage('적립을 확인하지 못했어요. 다시 시도해주세요.'); } finally { setBusy(false); } }}>포인트 적립 다시 시도</button>}
  </div>;
}
