import { useState, type FormEvent } from 'react';
import { dogProfileLabel, type DogInput, type DogProfile } from './dog-profiles';

export default function DogProfiles({ dogs, onSave, onDelete }: {
  dogs: DogProfile[];
  onSave: (id: string, dog: DogInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  function edit(dog?: DogProfile) { setFeedback(''); setDeleting(null); setEditing(dog?.id ?? ''); }
  async function remove(dog: DogProfile) {
    if (busy) return;
    setBusy(true); setFeedback('');
    try { await onDelete(dog.id); setDeleting(null); setFeedback('반려견 정보를 삭제했어요.'); }
    catch (error) { setFeedback((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="dog-profiles" aria-label="내 반려견 프로필">
    {feedback && <p role="status">{feedback}</p>}
    {editing === null ? <>
      {!dogs.length && <p>등록된 반려견 정보가 없어요.</p>}
      {dogs.length > 0 && <ul className="dog-list">{dogs.map(dog => <li key={dog.id}>
        <div><strong>{dogProfileLabel(dog)}</strong></div>
        <button type="button" className="course-outline" disabled={busy} onClick={() => edit(dog)} aria-label={dogProfileLabel(dog) + ' 수정'}>수정</button>
        {deleting !== dog.id ? <button type="button" className="course-outline dog-delete-button" disabled={busy} onClick={() => { setFeedback(''); setDeleting(dog.id); }} aria-label={(dog.name || '반려견') + ' 정보 삭제'}>삭제</button>
          : <div className="dog-delete-confirm" role="group" aria-label={(dog.name || '반려견') + ' 삭제 확인'}>
            <p>{dog.name || '이 반려견'}의 이름과 산책 조건을 삭제할까요? 삭제한 정보는 복구할 수 없어요.</p>
            <button type="button" className="course-outline dog-delete-button" disabled={busy} onClick={() => void remove(dog)}>{busy ? '삭제 중…' : '삭제 확인'}</button>
            <button type="button" className="course-outline" disabled={busy} onClick={() => setDeleting(null)}>취소</button>
          </div>}
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
  const [name, setName] = useState(dog?.name ?? '');
  const [walkMinutes, setWalkMinutes] = useState<number | null>(dog ? dog.walkMinutes : 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || skipping || walkMinutes == null) return;
    setBusy(true);
    setError('');
    try { await onSave({ name: name.trim(), walkMinutes }); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <form className="course-form dog-form" onSubmit={submit}>
      {error && <p className="account-feedback" role="alert">{error}</p>}
      <fieldset disabled={busy || skipping}>
        <legend>{dog ? '반려견 수정' : '반려견 정보'}</legend>
        <label>반려견 이름<input required maxLength={20} value={name}
          onChange={e => setName(e.target.value)}/></label>
        <label>선호 산책 시간 (분)<input type="number" required min={1} max={600} value={walkMinutes ?? ''}
          onChange={e => setWalkMinutes(e.target.value === '' ? null : e.target.valueAsNumber)}/></label>
      </fieldset>
      {reminder && <label className="dog-check"><input type="checkbox" checked={reminder.hidden}
        disabled={busy || skipping} onChange={event => reminder.onChange(event.target.checked)}/> 3일간 보지 않기</label>}
      <div className="dog-form-actions"><button className="primary-button" disabled={busy || skipping}>{busy ? '저장 중…' : '프로필 저장'}</button>
        <button type="button" className="course-outline" disabled={busy || skipping} onClick={onCancel}>{cancelLabel}</button></div>
    </form>;
}
