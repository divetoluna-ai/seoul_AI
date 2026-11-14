import { useEffect, useState, type FormEvent } from 'react';
import { accountApi, dogSizes, type DogInput, type DogProfile, type DogSize, type PublicDog } from './dog-profiles';

const emptyDog: DogInput = {
  name: '', size: 'SMALL', age: null, walkMinutes: 30,
};

export function PublicDogProfile({ id }: { id: string }) {
  const [dog, setDog] = useState<PublicDog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    accountApi<PublicDog>(`/dogs/${id}/public`, 'GET', undefined, abort.signal).then(setDog)
      .catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [id]);
  if (error) return <p className="account-feedback" role="alert">{error}</p>;
  if (!dog) return <p role="status">프로필을 불러오고 있어요…</p>;
  return <p><strong>{dog.name}</strong> · {dogSizes[dog.size]}</p>;
}

export default function DogProfiles({ dogs, onSave, onVisibilityChange }: {
  dogs: DogProfile[];
  onSave: (id: string, dog: DogInput) => Promise<void>;
  onVisibilityChange: (id: string, publicProfile: boolean) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  function edit(dog?: DogProfile) {
    setFeedback('');
    setEditing(dog?.id ?? '');
  }
  async function changeVisibility(dog: DogProfile) {
    setBusy(true);
    setFeedback('');
    try {
      await onVisibilityChange(dog.id, !dog.publicProfile);
      setFeedback('공개 설정을 저장했어요.');
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="dog-profiles" aria-label="내 반려견 프로필">
    {feedback && <p role="status">{feedback}</p>}
    {editing === null ? <>
      {dogs.length > 0 && <ul className="dog-list">{dogs.map(dog => <li key={dog.id}>
        <div><strong>{dog.name}</strong><small>{dogSizes[dog.size]} · {dog.walkMinutes}분 · {dog.publicProfile ? '공개' : '비공개'}</small></div>
        <button type="button" className="course-outline" disabled={busy} onClick={() => edit(dog)} aria-label={`${dog.name} 수정`}>수정</button>
        <button type="button" className="course-outline" disabled={busy} onClick={() => void changeVisibility(dog)}
          aria-label={`${dog.name} ${dog.publicProfile ? '비공개로 전환' : '이름과 크기 공개'}`}>{dog.publicProfile ? '비공개로 전환' : '이름과 크기 공개'}</button>
        {dog.publicProfile && <a className="course-outline" href={`#dog/${dog.id}`}>공개 프로필</a>}
      </li>)}</ul>}
      <button type="button" className="primary-button" disabled={busy} onClick={() => edit()}>반려견 등록</button>
    </> : <DogProfileForm key={editing} dog={dogs.find(item => item.id === editing)}
      onSave={async input => { await onSave(editing, input); setEditing(null); setFeedback('반려견 프로필을 저장했어요.'); }}
      onCancel={() => setEditing(null)}/>}
  </section>;
}

export function DogProfileForm({ dog, onSave, onCancel, skipping = false, cancelLabel = '취소', reminder }: {
  dog?: DogProfile;
  onSave: (input: DogInput) => Promise<void>;
  onCancel: () => void;
  skipping?: boolean;
  cancelLabel?: string;
  reminder?: { hidden: boolean; onChange: (hidden: boolean) => void };
}) {
  const [form, setForm] = useState<DogInput>(() => dog ? {
    name: dog.name, size: dog.size, age: dog.age, walkMinutes: dog.walkMinutes,
  } : emptyDog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || skipping) return;
    setBusy(true);
    setError('');
    try { await onSave(form); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <form className="course-form dog-form" onSubmit={submit}>
      {error && <p className="account-feedback" role="alert">{error}</p>}
      <fieldset disabled={busy || skipping}>
        <legend>{dog ? '반려견 수정' : '반려견 정보'}</legend>
        <label>반려견 이름<input required maxLength={20} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
        <label>크기<select value={form.size} onChange={e => setForm({ ...form, size: e.target.value as DogSize })}>
          {Object.entries(dogSizes).map(([size, label]) => <option key={size} value={size}>{label}</option>)}
        </select></label>
        <label>나이 <small>선택</small><input type="number" min={0} max={40} value={form.age ?? ''} onChange={e => setForm({ ...form, age: e.target.value === '' ? null : e.target.valueAsNumber })}/></label>
        <label>선호 산책 시간 (분)<input type="number" required min={1} max={600} value={Number.isNaN(form.walkMinutes) ? '' : form.walkMinutes} onChange={e => setForm({ ...form, walkMinutes: e.target.valueAsNumber })}/></label>
      </fieldset>
      {reminder && <label className="dog-check"><input type="checkbox" checked={reminder.hidden}
        disabled={busy || skipping} onChange={event => reminder.onChange(event.target.checked)}/> 3일간 보지 않기</label>}
      <div className="dog-form-actions"><button className="primary-button" disabled={busy || skipping}>{busy ? '저장 중…' : '프로필 저장'}</button>
        <button type="button" className="course-outline" disabled={busy || skipping} onClick={onCancel}>{cancelLabel}</button></div>
    </form>;
}
