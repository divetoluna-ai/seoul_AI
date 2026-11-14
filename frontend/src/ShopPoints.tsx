import { useState, type FormEvent } from 'react';
import PointsPanel from './PointsPanel';
import { communityApi, type Profile } from './community-api';

export default function ShopPoints() {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nickname: '', petName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function edit() {
    setBusy(true); setError('');
    try {
      const data = await communityApi<{profile: Profile | null}>('/profile');
      setForm({ nickname: data.profile?.nickname || '', petName: data.profile?.petName || '' });
      setEditing(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await communityApi('/profile', 'POST', form); setEditing(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section id="shop-points" className="shop-points" aria-label="포인트 적립 및 내역">
    <div className="shop-section-title"><div><span className="shop-eyebrow">MY POINTS</span><h2>함께 모으는 포인트</h2></div><button disabled={busy} className="shop-profile-edit" onClick={() => void edit()}>포인트 프로필 설정</button></div>
    <PointsPanel onEditProfile={() => { if (!busy) void edit(); }}/>
    {error && <p role="alert">{error}</p>}
    {editing && <form className="shop-profile-form" onSubmit={save}><h3>포인트 프로필 설정</h3><p>적립에 사용할 이웃 프로필과 반려동물을 등록해주세요.</p><label>닉네임<input required minLength={2} maxLength={16} autoComplete="nickname" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })}/></label><label>반려동물 이름<input maxLength={20} value={form.petName} onChange={e => setForm({ ...form, petName: e.target.value })}/></label><div><button className="primary-button" disabled={busy}>{busy ? '저장 중…' : '프로필 저장'}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>취소</button></div></form>}
  </section>;
}
