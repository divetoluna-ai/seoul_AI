import { useEffect, useRef, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import kakaoLoginButton from './kakao-login.svg';
import './account.css';
import { useMemberProfile } from './MemberProfile';
import type { MemberUser } from './member-profile';

type Session = {
  enabled: boolean;
  loginOrigin: string;
  user: { id: string; nickname: string } | null;
};

const callbackErrors: Record<string, string> = {
  cancelled: '카카오 로그인을 취소했어요.',
  expired: '로그인 요청이 만료됐어요. 카카오 로그인 버튼을 다시 눌러주세요.',
  failed: '카카오 로그인에 실패했어요. 잠시 후 다시 시도해주세요.',
  misconfigured: '카카오 로그인 설정을 확인해야 해요 (KOE010). 서비스 관리자에게 알려주세요.',
  unavailable: '아직 카카오 로그인 설정이 완료되지 않았어요.',
};

export default function AccountMenu({ onSessionChange }: { onSessionChange: (loggedIn: boolean, user?: MemberUser | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { profile, openProfile } = useMemberProfile();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('login');
    if (!result || !Object.hasOwn(callbackErrors, result)) return;
    setFeedback(callbackErrors[result]);
    url.searchParams.delete('login');
    window.history.replaceState(window.history.state, '', url);
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setSessionError('');
    fetch('/api/auth/session', { credentials: 'same-origin', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Session>;
      })
      .then(value => { setSession(value); onSessionChange(!!value.user, value.user); })
      .catch(() => {
        if (!controller.signal.aborted) { setSession(null); onSessionChange(false); setSessionError('로그인 정보를 불러오지 못했어요.'); }
      });
    return () => controller.abort();
  }, [retry, onSessionChange]);
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    const expired = () => { setSession(current => current && { ...current, user: null }); onSessionChange(false); refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('auth-session-expired', expired);
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('auth-session-expired', expired); document.removeEventListener('visibilitychange', visible); };
  }, [onSessionChange]);

  async function logout() {
    setFeedback('');
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin', headers: { 'X-Auth-Client': 'web' },
      });
      if (!response.ok) throw new Error();
      setSession(current => current && { ...current, user: null });
      onSessionChange(false);
      dialog.current?.close();
    } catch {
      setFeedback('로그아웃하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSigningOut(false);
    }
  }

  function showAccount() {
    setFeedback('');
    dialog.current?.showModal();
  }

  const section = window.location.hash.slice(1);
  const loginPath = `/api/auth/kakao?section=${encodeURIComponent(section)}`;
  const user = session?.user;

  return <>
    <button type="button" className="account-trigger" onClick={showAccount} aria-haspopup="dialog">
      <UserRound size={17} aria-hidden="true" />
      <span>{profile?.nickname || user?.nickname || '로그인'}</span>
    </button>
    <dialog ref={dialog} className="account-dialog" aria-labelledby="account-title">
      <button type="button" className="dialog-close" aria-label="닫기" onClick={() => dialog.current?.close()}>
        <X size={20} />
      </button>
      <h2 id="account-title">{user ? '내 계정' : '로그인 · 회원가입'}</h2>
      {feedback && <p className="account-feedback" role="alert">{feedback}</p>}
      {user ? <>
        <p>{profile?.nickname || user.nickname}님, 카카오 계정으로 로그인했어요.</p><button type="button" className="primary-button" onClick={() => { dialog.current?.close(); openProfile(); }}>프로필 설정</button>
        <button type="button" className="secondary-button" disabled={signingOut} onClick={logout}>
          {signingOut ? '로그아웃 중…' : '로그아웃'}
        </button>
      </> : sessionError ? <>
        <p role="alert">{sessionError}</p>
        <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>다시 시도</button>
      </> : !session ? <p role="status">로그인 정보를 확인하고 있어요…</p> : session.enabled ? <>
        <p>처음 이용하시면 카카오 인증 후 회원가입이 완료돼요.</p>
        <a className="kakao-login-link" href={`${session.loginOrigin}${loginPath}`}>
          <img src={kakaoLoginButton} alt="카카오 로그인" width="224" height="46" />
        </a>
      </> : !feedback && <p role="status">{callbackErrors.unavailable}</p>}
    </dialog>
  </>;
}
