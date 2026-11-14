import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PawPrint, X } from 'lucide-react';
import { communityApi, type Profile } from './community-api';
import { profileComplete, profileInput, type MemberUser } from './member-profile';
import './account.css';

type ProfileState = { profile: Profile | null; ready: boolean; isOpen: boolean; openProfile: () => void; ensureProfile: (action: () => void) => void };
const Context = createContext<ProfileState | null>(null);
export function useMemberProfile() {
  const value = useContext(Context);
  if (!value) throw new Error('MemberProfileProvider is required');
  return value;
}
export default function MemberProfileProvider({ user, children }: { user: MemberUser | null; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!user);
  const [isOpen, setOpen] = useState(false);
  const [form, setForm] = useState({ nickname: '', petName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<(() => void) | null>(null);
  const openProfile = useCallback(() => {
    if (!user) return;
    setForm({ nickname: profile?.nickname || (user.nickname === '카카오 회원' ? '' : user.nickname), petName: profile?.petName || '' });
    setError(''); setOpen(true);
  }, [user, profile]);
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController(); setReady(false);
    communityApi<{profile: Profile | null}>('/profile', 'GET', undefined, abort.signal).then(data => {
      if (abort.signal.aborted) return;
      setProfile(data.profile); setError('');
      if (!profileComplete(data.profile)) {
        setForm({ nickname: data.profile?.nickname || (user.nickname === '카카오 회원' ? '' : user.nickname), petName: data.profile?.petName || '' });
        setOpen(true);
      }
    }).catch(e => { if (!abort.signal.aborted) { setError(e.message); setOpen(true); } })
      .finally(() => { if (!abort.signal.aborted) setReady(true); });
    return () => abort.abort();
  }, [user?.id, retry]);
  useEffect(() => {
    if (isOpen) dialog.current?.showModal(); else dialog.current?.close();
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen && profileComplete(profile) && pending.current) {
      const action = pending.current; pending.current = null; action();
    }
  }, [isOpen, profile]);
  function close() { if (!busy) { pending.current = null; setOpen(false); } }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !ready || !user) return;
    setError('');
    let input;
    try { input = profileInput(form); } catch (e) { setError((e as Error).message); return; }
    setBusy(true);
    try { const value = await communityApi<Profile>('/profile', 'POST', input); setProfile(value); setOpen(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const ensureProfile = (action: () => void) => {
    if (!user) return;
    if (profileComplete(profile)) action(); else { pending.current = action; openProfile(); }
  };
  return <Context.Provider value={{ profile, ready, isOpen, openProfile, ensureProfile }}>
    {children}
    {user && <dialog ref={dialog} className="account-dialog member-profile-dialog" aria-labelledby="member-profile-title" onCancel={e => { e.preventDefault(); close(); }}>
      <button type="button" className="dialog-close" aria-label="프로필 설정 닫기" disabled={busy} onClick={close}><X size={20}/></button>
      <span className="member-profile-icon"><PawPrint size={26}/></span><h2 id="member-profile-title">프로필 설정</h2>
      <p>카카오 계정에 연결할 닉네임과 반려견을 등록해주세요.<br/>코스 공유·포인트·NFC에서 이 프로필을 함께 사용해요.</p>
      {error && <p className="account-feedback" role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>다시 불러오기</button></p>}
      {!ready ? <p role="status">프로필을 확인하고 있어요…</p> : <form className="member-profile-form" onSubmit={save}>
        <label>닉네임<input required minLength={2} maxLength={16} autoComplete="nickname" placeholder="예: 보리와 산책" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })}/></label>
        <fieldset><legend>반려견 등록</legend><label>반려견 이름<input required maxLength={20} placeholder="예: 보리" value={form.petName} onChange={e => setForm({ ...form, petName: e.target.value })}/></label><small>등록한 반려견은 NFC 적립 프로필에도 연결돼요.</small></fieldset>
        <div className="member-profile-actions"><button className="primary-button" disabled={busy}>{busy ? '저장 중…' : '프로필 저장'}</button><button type="button" disabled={busy} onClick={close}>나중에</button></div>
      </form>}
    </dialog>}
  </Context.Provider>;
}
