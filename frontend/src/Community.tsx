import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Heart, Info, LoaderCircle, MapPin, PawPrint, Pencil, Plus, Route, Search, Share2, Trash2, X } from 'lucide-react';
import { categoryLabel, mapUrl, photoCredit, photoPage, safeImage, type Place, type Region } from './lib';
import { communityApi as request, communityDate, courseIdFromHash, courseInput, courseShareUrl, type Profile, type CourseView, type CourseFeed, type WalkConditions } from './community-api';
import { MAX_STOPS } from './trip';
import CoursePreview from './CoursePreview';
import './community.css';
import PointsPanel from './PointsPanel';
import { dogSizes, type DogProfile } from './dog-profiles';
import WalkConditionsFields from './WalkConditionsFields';

function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const callback = useRef(close); callback.current = close;
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`course-modal ${wide ? 'course-modal-wide' : ''}`} aria-label={title}
    onCancel={e => { e.preventDefault(); callback.current(); }} onClick={e => { if (e.target === e.currentTarget) callback.current(); }}>
    <div className="course-modal-heading"><h2>{title}</h2><button type="button" onClick={close} aria-label={`${title} 닫기`}><X size={20}/></button></div>{children}
  </dialog>;
}
function ErrorMessage({ message }: { message: string }) { return message ? <p className="course-error" role="alert"><Info size={16}/>{message}</p> : null; }
function CourseStops({ stops, onChange }: { stops: Place[]; onChange?: (p: Place[]) => void }) {
  const move = (i: number, direction: number) => {
    const next = [...stops]; [next[i], next[i + direction]] = [next[i + direction], next[i]]; onChange?.(next);
  };
  return <ol className="course-stops">{stops.map((p, i) => <li key={p.id}>
    <span className="course-stop-number">{i + 1}</span><div><small>{i === 0 ? '출발' : i === stops.length - 1 ? '도착' : '경유'} · {categoryLabel(p.category)}</small><strong>{p.name}</strong><p>{p.address}</p>
      {!onChange && <a href={mapUrl(p)} target="_blank" rel="noreferrer">카카오맵에서 보기 ↗</a>}</div>
    {onChange && <div className="course-stop-edit"><button type="button" disabled={i === 0} aria-label={`${p.name} 앞으로`} onClick={() => move(i, -1)}><ArrowUp size={14}/></button><button type="button" disabled={i === stops.length - 1} aria-label={`${p.name} 뒤로`} onClick={() => move(i, 1)}><ArrowDown size={14}/></button><button type="button" disabled={stops.length <= 2} aria-label={`${p.name} 삭제`} onClick={() => onChange(stops.filter(s => s.id !== p.id))}><X size={14}/></button></div>}
  </li>)}</ol>;
}

export default function Community({ regions, tripStops, initialRegion, shareRequest, onShareHandled, onImportCourse, onBrowse, dogs }: {
  regions: Region[]; tripStops: Place[]; initialRegion: string; shareRequest: number; onShareHandled: () => void; onImportCourse: (p: Place[]) => void; onBrowse: () => void;
  dogs: DogProfile[] | null;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ nickname: '', petName: '' });
  const afterProfile = useRef<(() => void) | null>(null);
  const [region, setRegion] = useState('');
  const [draft, setDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('recent');
  const [mine, setMine] = useState(false);
  const [dogId, setDogId] = useState('');
  const chosenDog = dogs?.find(item => item.id === dogId);
  const [page, setPage] = useState(1);
  const [feed, setFeed] = useState<CourseFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [toast, setToast] = useState('');
  const [composer, setComposer] = useState(false);
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState({ title: '', content: '', region: initialRegion });
  const [walk, setWalk] = useState<WalkConditions | null>(null);
  const [composeStops, setComposeStops] = useState<Place[]>([]);
  const [selected, setSelected] = useState(() => courseIdFromHash(window.location.hash));
  const [detail, setDetail] = useState<CourseView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const handledShare = useRef(0);
  const options = regions.length ? regions : [{ code: '11', name: '서울' }];
  const regionName = (code: string) => options.find(r => r.code === code)?.name || code;

  useEffect(() => {
    const abort = new AbortController();
    request<{ profile: Profile | null }>('/profile', 'GET', undefined, abort.signal).then(data => setProfile(data.profile))
      .catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setProfileReady(true); });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const sync = () => { setSelected(courseIdFromHash(window.location.hash)); setError(''); setDeleteConfirm(false); setReplaceConfirm(false); };
    window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setFeedError('');
    const params = new URLSearchParams({ region, keyword, sort, mine: String(mine), page: String(page) });
    if (chosenDog) params.set('dog', chosenDog.id);
    request<CourseFeed>(`/courses?${params}`, 'GET', undefined, abort.signal)
      .then(data => { if (!abort.signal.aborted) setFeed(data); })
      .catch(e => {
        if (abort.signal.aborted) return;
        if (chosenDog && (e.status === 401 || e.status === 404)) {
          setDogId(''); setPage(1); setToast('반려견 추천을 적용할 수 없어 전체 코스를 표시해요.');
        } else setFeedError(e.message);
      }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [region, keyword, sort, mine, page, revision, chosenDog]);
  useEffect(() => {
    if (dogId && !chosenDog) { setDogId(''); setPage(1); }
  }, [dogId, chosenDog]);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    const abort = new AbortController(); setDetailLoading(true);
    setDetail(current => current?.course.id === selected ? current : null);
    request<CourseView>(`/courses/${selected}`, 'GET', undefined, abort.signal).then(setDetail)
      .catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setDetailLoading(false); });
    return () => abort.abort();
  }, [selected, revision]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!shareRequest || !profileReady || handledShare.current === shareRequest) return;
    handledShare.current = shareRequest; onShareHandled(); startCreate();
  }, [shareRequest, profileReady]);

  function closeCourse() { if (busy) return; setSelected(''); window.location.hash = 'community'; setError(''); }
  function openCourse(id: string) { setSelected(id); window.location.hash = `community/course/${id}`; setError(''); setDeleteConfirm(false); setReplaceConfirm(false); }
  function openProfile(next?: () => void) { setError(''); afterProfile.current = next || null; setProfileForm({ nickname: profile?.nickname || '', petName: profile?.petName || '' }); setProfileOpen(true); }
  function withProfile(action: () => void) { if (profile) action(); else openProfile(action); }
  async function run(action: () => Promise<void>) {
    if (lock.current) return false; lock.current = true; setBusy(true); setError('');
    try { await action(); return true; } catch (e) { setError((e as Error).message); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  function startCreate() {
    if (tripStops.length < 2) { onBrowse(); return; }
    withProfile(() => { setEditing(''); setForm({ title: '', content: '', region: initialRegion }); setWalk(null); setComposeStops([...tripStops]); setComposer(true); setError(''); });
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); const next = afterProfile.current;
    const success = await run(async () => { const saved = await request<Profile>('/profile', 'POST', profileForm); setProfile(saved); setProfileOpen(false); afterProfile.current = null; setRevision(n => n + 1); });
    if (success) next?.();
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const body = { ...courseInput(form.title, form.content, form.region, composeStops), walk };
      const result = await request<CourseView>(editing ? `/courses/${editing}` : '/courses', editing ? 'PUT' : 'POST', body);
      setComposer(false); setDetail(result); setPage(1); setRegion(''); setKeyword(''); setDraft(''); setMine(false); setDogId(''); setRevision(n => n + 1);
      openCourse(result.course.id); setToast(editing ? '공유 코스를 수정했어요.' : '우리의 코스를 공유했어요.');
    });
  }
  function editCourse(item: CourseView) {
    setEditing(item.course.id); setForm({ title: item.course.title, content: item.course.content, region: item.course.region });
    setWalk(item.course.walk ?? null);
    setComposeStops([...item.course.stops]); setSelected(''); window.location.hash = 'community'; setComposer(true); setError('');
  }
  async function likeCourse(item: CourseView) {
    withProfile(() => { void run(async () => {
      const result = await request<CourseView>(`/courses/${item.course.id}/like`, 'PUT', { enabled: !item.liked }); setDetail(result); setRevision(n => n + 1);
    }); });
  }
  async function copyLink(id: string) {
    try { await navigator.clipboard.writeText(courseShareUrl(id, window.location.href)); setToast('코스 링크를 복사했어요.'); }
    catch { setError('링크를 복사하지 못했어요. 아래 공유 주소를 직접 복사해주세요.'); }
  }
  function importCourse() {
    if (!detail) return;
    try { courseInput('', '', detail.course.region, detail.course.stops); onImportCourse(detail.course.stops.map(p => ({ ...p }))); }
    catch (e) { setError((e as Error).message); }
  }
  const course = detail?.course;
  const pages = Math.ceil((feed?.total || 0) / (feed?.pageSize || 12));
  const shareUrl = course ? courseShareUrl(course.id, window.location.href) : '';

  return <main className="course-community">
    <section className="course-hero"><div className="container course-hero-inner"><div><div className="eyebrow"><span/> OUR ROUTES TOGETHER</div><h1>좋았던 길은,<br/><span>함께 나누고 싶으니까.</span></h1><p>우리 아이와 찾은 카페, 산책길, 하룻밤의 쉼.<br/>내가 만든 코스를 공유하고, 새로운 여행을 만나보세요.</p><button className="primary-button" disabled={!profileReady} onClick={startCreate}><Share2 size={17}/>{tripStops.length >= 2 ? '내 코스 공유하기' : '나만의 코스 만들기'}</button></div><div className="course-hero-art" aria-hidden="true"><div className="course-art-line"/><span><MapPin size={25}/><small>느긋한 산책</small></span><span><PawPrint size={35}/><small>우리만의 여행</small></span><span><Heart size={24}/><small>함께 나누는 코스</small></span></div></div></section>
    <section className="container course-community-content">
      <PointsPanel onEditProfile={() => { setProfileForm({ nickname: profile?.nickname || '', petName: profile?.petName || '' }); setError(''); setProfileOpen(true); }}/>
      <div className="course-section-heading"><div><div className="eyebrow">A GOOD ROUTE IS WORTH SHARING</div><h2>함께 떠나는 코스 <Route size={24}/></h2><p>다른 여행자의 코스를 담아 나만의 순서로 이어가세요.</p></div><button className="course-profile" disabled={!profileReady} onClick={() => openProfile()}><span>{(profile?.nickname || '나').slice(0, 1)}</span><div>{profile?.nickname || '여행자 프로필 만들기'}<small>{profile?.petName ? `${profile.petName}와 함께하는 여행` : '닉네임으로 가볍게 시작해요'}</small></div></button></div>
      {!profileOpen && !composer && !selected && <ErrorMessage message={error}/>}
      <div className="course-current-plan"><Route size={22}/><div><strong>나의 여행 코스 <b>{tripStops.length}곳</b></strong><p>{tripStops.length ? tripStops.map(p => p.name).join(' → ') : '장소 둘러보기에서 방문할 곳을 순서대로 담아주세요.'}</p></div><button onClick={tripStops.length >= 2 ? startCreate : onBrowse} disabled={!profileReady}>{tripStops.length >= 2 ? <><Share2 size={15}/> 이 코스 공유하기</> : <><Plus size={15}/> 장소 고르기</>}</button></div>
      <form className="course-search" onSubmit={e => { e.preventDefault(); setKeyword(draft.trim()); setPage(1); }}><Search size={19}/><input aria-label="공유 코스 검색" placeholder="코스 이름, 장소, 여행 이야기를 찾아보세요" maxLength={60} value={draft} onChange={e => setDraft(e.target.value)}/>{draft && <button type="button" aria-label="코스 검색어 지우기" onClick={() => { setDraft(''); setKeyword(''); setPage(1); }}><X size={16}/></button>}<button className="course-search-submit">검색</button></form>
      <div className="course-toolbar"><div className="course-tabs"><button className={!mine ? 'active' : ''} onClick={() => { setMine(false); setPage(1); }}>모두의 코스</button><button className={mine ? 'active' : ''} disabled={!profileReady} onClick={() => withProfile(() => { setMine(true); setPage(1); })}>내가 공유한 코스</button><span>{loading ? '…' : feedError ? '—' : (feed?.total || 0).toLocaleString()}개의 여행</span></div><div className="course-filters"><select aria-label="공유 코스 지역" value={region} onChange={e => { setRegion(e.target.value); setPage(1); }}><option value="">전국 모든 지역</option>{options.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select><select aria-label="공유 코스 정렬" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="recent">최신순</option><option value="popular">좋아요 많은 순</option></select></div></div>
      {keyword && <p className="course-search-caption">“{keyword}” 검색 결과 <button aria-label="코스 검색 해제" onClick={() => { setKeyword(''); setDraft(''); setPage(1); }}><X size={13}/></button></p>}
      <div className="course-dog-filter">
        {dogs?.length ? <label>반려견 맞춤 추천
          <select value={chosenDog?.id ?? ''} onChange={event => { setDogId(event.target.value); setPage(1); }}>
            <option value="">전체 코스</option>
            {dogs.map(dog => <option key={dog.id} value={dog.id}>{dog.name} · {dogSizes[dog.size]}</option>)}
          </select>
        </label> : <a className="course-outline" href="#community/dogs">반려견 등록하고 맞춤 코스 찾기</a>}
        {chosenDog && <p>{chosenDog.walkMinutes}분 이내 · {dogSizes[chosenDog.size]}. 작성자가 조건을 입력한 코스를 표시해요.</p>}
      </div>
      {loading ? <div className="course-loading" role="status"><LoaderCircle className="spin" size={22}/> 여행자들의 코스를 불러오고 있어요</div> : feedError ? <div className="course-empty" role="alert"><Info size={32}/><h3>코스를 불러오지 못했어요</h3><p>{feedError}</p><button className="primary-button" onClick={() => setRevision(n => n + 1)}>다시 시도</button></div> : !feed?.items.length ? <div className="course-empty"><Route size={38}/><h3>{chosenDog ? '반려견의 조건에 맞는 코스가 없어요' : keyword || region ? '이 조건의 코스를 아직 찾지 못했어요' : mine ? '나만의 첫 코스를 공유해보세요' : '첫 번째 여행 코스를 기다리고 있어요'}</h3><p>{chosenDog ? '전체 코스를 선택해 산책 조건이 등록되지 않은 코스도 둘러볼 수 있어요.' : keyword || region ? '다른 지역이나 검색어로 찾아보세요.' : '좋아하는 장소를 두 곳 이상 담고, 여행 이야기를 들려주세요.'}</p><button className="primary-button" disabled={!profileReady} onClick={startCreate}>나의 코스 만들고 공유하기 <ArrowRight size={16}/></button></div> : <div className="shared-course-grid">{feed.items.map(item => {
        const cover = item.course.stops.find(p => p.image);
        return <article className="shared-course-card" key={item.course.id}><button className="shared-course-open" onClick={() => openCourse(item.course.id)} aria-label={`${item.course.title} 코스 자세히 보기`}><div className="shared-course-cover"><img loading="lazy" src={safeImage(cover?.image || '')} alt={cover ? `${cover.name} 사진` : '여행 코스'} onError={e => { if (e.currentTarget.getAttribute('src') !== '/images/placeholder.svg') e.currentTarget.src = '/images/placeholder.svg'; }}/><span><Route size={13}/>{item.course.stops.length}곳을 잇는 여행</span><b>{regionName(item.course.region)}</b></div><div className="shared-course-body"><h3>{item.course.title}</h3><p className="shared-course-intro">{item.course.content}</p><ol className="shared-course-mini-stops">{item.course.stops.slice(0, 3).map((p, i) => <li key={p.id}><span>{i+1}</span>{p.name}</li>)}{item.course.stops.length > 3 && <li className="course-more-stops">+{item.course.stops.length-3}곳 더</li>}</ol><div className="shared-course-footer"><span>{item.author.nickname} · {communityDate(item.course.createdAt)}</span><span><Heart size={13} fill={item.liked ? 'currentColor' : 'none'}/>{item.likeCount}</span></div></div></button>{cover && photoCredit(cover) && <p className="course-photo-credit">{photoPage(cover) ? <a href={photoPage(cover)} target="_blank" rel="noreferrer">{photoCredit(cover)} ↗</a> : photoCredit(cover)}</p>}</article>;
      })}</div>}
      {!loading && !feedError && pages > 1 && <nav className="pagination" aria-label="공유 코스 페이지"><button aria-label="이전 코스 페이지" disabled={page === 1} onClick={() => setPage(n => n - 1)}><ChevronLeft size={16}/></button><span><b>{page}</b> / {pages}</span><button aria-label="다음 코스 페이지" disabled={page >= pages} onClick={() => setPage(n => n + 1)}><ChevronRight size={16}/></button></nav>}
      <p className="course-community-note"><PawPrint size={14}/> 같은 서버에 접속한 여행자들과 코스를 나눠요. 방문 전 각 장소의 동반 조건을 확인해주세요.</p>
    </section>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {profileOpen && <Modal title="여행자 프로필" close={() => { if (!busy) { setProfileOpen(false); afterProfile.current = null; setError(''); } }}><form className="course-form" onSubmit={saveProfile}><p>코스에 표시할 여행자 이름을 알려주세요.</p><ErrorMessage message={error}/><label>닉네임<input required minLength={2} maxLength={16} autoComplete="nickname" placeholder="예: 보리와 산책" value={profileForm.nickname} onChange={e => setProfileForm({ ...profileForm, nickname: e.target.value })}/></label><label>반려동물 이름 <small>선택</small><input maxLength={20} value={profileForm.petName} onChange={e => setProfileForm({ ...profileForm, petName: e.target.value })}/></label><p className="course-session-note">이 브라우저에 연결된 간편 프로필이에요. 쿠키를 삭제하면 기존 프로필을 복구할 수 없어요.</p><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} 프로필 저장</button></form></Modal>}
    {composer && <Modal title={editing ? '공유 코스 수정' : '우리의 코스 공유하기'} close={() => { if (!busy) { setComposer(false); setError(''); } }} wide><form className="course-form" onSubmit={publish}><p>방문할 장소와 순서를 확인하고, 이 코스가 좋은 이유를 들려주세요.</p><ErrorMessage message={error}/><div className="course-compose-fields"><label>코스 이름<input required minLength={2} maxLength={80} placeholder="예: 보리와 보내는 느긋한 서울숲 하루" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></label><label>대표 지역<select value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}>{options.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label></div><label>코스 소개<textarea required minLength={5} maxLength={5000} rows={4} placeholder="추천하는 방문 시간, 쉬어가기 좋은 곳, 반려동물과 함께할 때의 팁을 알려주세요." value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}/></label><WalkConditionsFields walk={walk} onChange={setWalk}/><div className="course-compose-stops"><h3>방문 순서 <span>{composeStops.length}/{MAX_STOPS}곳</span></h3><CourseStops stops={composeStops} onChange={setComposeStops}/></div><p className="course-session-note">선택한 장소와 순서가 공개돼요. 현재 위치는 공유하지 않습니다.</p><button className="primary-button" disabled={busy || composeStops.length < 2}>{busy ? <LoaderCircle className="spin" size={17}/> : <Share2 size={17}/>} {editing ? '수정한 코스 저장' : '코스 공유하기'}</button></form></Modal>}
    {selected && !profileOpen && <Modal title="함께 떠나는 코스" close={closeCourse} wide><ErrorMessage message={error}/>{!course ? <div className="course-loading">{detailLoading && <><LoaderCircle className="spin" size={22}/> 코스를 불러오고 있어요</>}{!detailLoading && <button onClick={() => setRevision(n => n + 1)}>다시 시도</button>}</div> : <div className="course-detail"><div className="course-detail-label"><span>{regionName(course.region)}</span><span><Route size={14}/>{course.stops.length}곳의 여행</span></div><h2>{course.title}</h2><p className="course-detail-author">{detail.author.nickname}{detail.author.petName && ` · ${detail.author.petName}와 함께`}<time>{communityDate(course.createdAt)}</time></p><p className="course-description">{course.content}</p>{course.walk && <p className="course-walk-summary">예상 산책 {course.walk.minutes}분 · {course.walk.sizes.map(size => dogSizes[size]).join("·")}{course.walk.stairs != null && (course.walk.stairs ? " · 계단 있음" : " · 계단 없음")}{course.walk.shade != null && (course.walk.shade ? " · 그늘 있음" : " · 그늘 없음")}{course.walk.quiet === true && " · 조용한 코스"}</p>}<CoursePreview stops={course.stops}/><div className="course-detail-stops"><h3>이 순서로 함께 가요</h3><CourseStops stops={course.stops}/></div><div className="course-detail-actions"><button className="primary-button" disabled={busy} onClick={() => tripStops.length ? setReplaceConfirm(true) : importCourse()}><Plus size={17}/> 내 코스로 가져오기</button><button className={`course-outline ${detail.liked ? 'liked' : ''}`} disabled={busy || !profileReady} onClick={() => void likeCourse(detail)}><Heart size={16} fill={detail.liked ? 'currentColor' : 'none'}/> 좋아요 {detail.likeCount}</button><button className="course-outline" onClick={() => void copyLink(course.id)}><Copy size={16}/> 링크 복사</button></div>{replaceConfirm && <div className="course-confirm" role="group" aria-label="나의 코스 교체 확인"><p>현재 담은 {tripStops.length}곳을 이 코스로 바꿀까요?</p><button className="primary-button" onClick={importCourse}>이 코스로 바꾸기</button><button onClick={() => setReplaceConfirm(false)}>취소</button></div>}<label className="course-share-address">공유 링크<input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} aria-label="코스 공유 링크"/></label>{detail.mine && <div className="course-owner-actions"><button disabled={busy} onClick={() => editCourse(detail)}><Pencil size={14}/> 코스 수정</button>{!deleteConfirm ? <button disabled={busy} onClick={() => setDeleteConfirm(true)}><Trash2 size={14}/> 공유 삭제</button> : <div className="course-confirm"><span>공유한 코스를 삭제할까요?</span><button disabled={busy} onClick={() => void run(async () => { await request(`/courses/${course.id}`, 'DELETE'); setSelected(''); window.location.hash = 'community'; setRevision(n => n + 1); setToast('코스 공유를 삭제했어요.'); })}>삭제하기</button><button disabled={busy} onClick={() => setDeleteConfirm(false)}>취소</button></div>}</div>}</div>}</Modal>}
  </main>;
}
