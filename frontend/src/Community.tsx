import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, Heart, ImagePlus, Info, LoaderCircle, MapPin, MessageCircle, PawPrint, Plus, Search, Send, ShoppingBag, Sprout, Trash2, Users, X } from 'lucide-react';
import { api, type Region } from './lib';
import { communityApi as request, communityCategories as categories, communityDate as date, postPrice, postStatus, preparePhoto, type CommunityCategory, type CommunityPost, type Profile, type PostView, type PostDetail, type Feed, type Conversation, type ConversationDetail } from './community-api';
import './community.css';
import PointsPanel from './PointsPanel';

function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const callback = useRef(close); callback.current = close;
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`community-modal ${wide ? 'community-modal-wide' : ''}`} aria-label={title} onCancel={e => { e.preventDefault(); callback.current(); }} onClick={e => { if (e.target === e.currentTarget) callback.current(); }}>
    <div className="community-modal-heading"><h2>{title}</h2><button type="button" onClick={close} aria-label={`${title} 닫기`}><X size={21}/></button></div>{children}
  </dialog>;
}
const icons = { info: Sprout, walk: Users, market: ShoppingBag };
function Badge({ category }: { category: CommunityCategory }) { const Icon = icons[category]; return <span className={`community-badge ${category}`}><Icon size={13}/>{categories[category]}</span>; }
function Avatar({ name }: { name: string }) { return <span className="community-avatar" aria-hidden="true">{name.slice(0, 1)}</span>; }
function ErrorMessage({ message }: { message: string }) { return message ? <p className="community-error" role="alert"><Info size={16}/>{message}</p> : null; }
const initialPost = { category: 'info' as CommunityCategory, title: '', content: '', region: '11', district: '', tradeType: 'sale', price: '', image: '', meetingAt: '', meetingPlace: '', capacity: '4' };

export default function Community({ regions }: { regions: Region[] }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const profileRef = useRef(profile); profileRef.current = profile;
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ nickname: '', petName: '', region: '11', district: '' });
  const [profileDistricts, setProfileDistricts] = useState<Region[]>([]);
  const afterProfile = useRef<(() => void) | null>(null);
  const [category, setCategory] = useState('all');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [districts, setDistricts] = useState<Region[]>([]);
  const [draft, setDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('recent');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [composer, setComposer] = useState(false);
  const [postForm, setPostForm] = useState(initialPost);
  const [postDistricts, setPostDistricts] = useState<Region[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [comment, setComment] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatId, setChatId] = useState('');
  const [chat, setChat] = useState<ConversationDetail | null>(null);
  const [message, setMessage] = useState('');
  const [inboxLoading, setInboxLoading] = useState(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const regionName = (code: string) => regions.find(r => r.code === code)?.name || '서울';
  const location = (p: { region: string; district: string }) => `${regionName(p.region)} ${p.district}`.trim();

  useEffect(() => { const abort = new AbortController(); request<{ profile: Profile | null }>('/profile', 'GET', undefined, abort.signal)
    .then(data => setProfile(data.profile)).catch(e => { if (e.name !== 'AbortError') setFeedError(e.message); })
    .finally(() => { if (!abort.signal.aborted) setProfileReady(true); }); return () => abort.abort(); }, [revision]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setFeedError('');
    const params = new URLSearchParams({ category, region, district, keyword, sort, mine: String(mine), page: String(page) });
    request<Feed>(`/posts?${params}`, 'GET', undefined, abort.signal).then(setFeed).catch(e => { if (e.name !== 'AbortError') setFeedError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); }); return () => abort.abort();
  }, [category, region, district, keyword, sort, mine, page, revision]);
  useEffect(() => {
    const abort = new AbortController(); setDistricts([]); if (region) api<Region[]>(`/districts?region=${region}`, abort.signal).then(setDistricts).catch(e => { if (e.name !== 'AbortError') setFeedError('동네 목록을 불러오지 못했어요. 새로고침해 다시 시도해주세요.'); });
    return () => abort.abort();
  }, [region, revision]);
  useEffect(() => {
    if (!profileOpen) return; const abort = new AbortController(); setProfileDistricts([]);
    api<Region[]>(`/districts?region=${profileForm.region}`, abort.signal).then(setProfileDistricts).catch(e => { if (e.name !== 'AbortError') setError('동네 목록을 불러오지 못했어요. 잠시 후 다시 열어주세요.'); });
    return () => abort.abort();
  }, [profileForm.region, profileOpen]);
  useEffect(() => {
    if (!composer) return; const abort = new AbortController(); setPostDistricts([]);
    api<Region[]>(`/districts?region=${postForm.region}`, abort.signal).then(setPostDistricts).catch(e => { if (e.name !== 'AbortError') setError('동네 목록을 불러오지 못했어요. 잠시 후 다시 열어주세요.'); });
    return () => abort.abort();
  }, [postForm.region, composer]);
  useEffect(() => {
    if (!selected || busy) return;
    const abort = new AbortController();
    const load = () => request<PostDetail>(`/posts/${selected}`, 'GET', undefined, abort.signal).then(setDetail).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    void load(); const timer = setInterval(load, 10000); return () => { abort.abort(); clearInterval(timer); };
  }, [selected, revision, busy]);
  useEffect(() => {
    if (!inbox || !profile || busy) return;
    const abort = new AbortController(); setInboxLoading(true);
    const load = async () => {
      try {
        const list = await request<Conversation[]>('/conversations', 'GET', undefined, abort.signal); if (!abort.signal.aborted) setConversations(list);
        if (chatId) { const data = await request<ConversationDetail>(`/conversations/${chatId}`, 'GET', undefined, abort.signal); if (!abort.signal.aborted) setChat(data); }
      } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
      finally { if (!abort.signal.aborted) setInboxLoading(false); }
    };
    void load(); const timer = setInterval(load, 4000); return () => { abort.abort(); clearInterval(timer); };
  }, [inbox, profile?.id, chatId, revision, busy]);
  const messageCount = chat?.messages.length || 0;
  useEffect(() => { messageEnd.current?.scrollIntoView({ block: 'nearest' }); }, [messageCount, chatId]);

  function openProfile(next?: () => void) { setError(''); afterProfile.current = next || null; setProfileForm(profile ? { nickname: profile.nickname, petName: profile.petName, region: profile.region, district: profile.district } : { nickname: '', petName: '', region: region || '11', district }); setProfileOpen(true); }
  function withProfile(action: () => void) { if (profile) action(); else openProfile(action); }
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function openComposer() { const current = profileRef.current; setError(''); setPostForm({ ...initialPost, category: category === 'all' ? 'info' : category as CommunityCategory, region: current?.region || region || '11', district: current ? current.district : district }); setComposer(true); }
  function openPost(id: string) { setSelected(id); setDetail(null); setComment(''); setError(''); setDeleteConfirm(false); }
  function openInbox() { setError(''); setInbox(true); }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); const pending = afterProfile.current; let saved = false;
    await run(async () => { const p = await request<Profile>('/profile', 'POST', profileForm); profileRef.current = p; setProfile(p); setProfileOpen(false); setToast('이웃 프로필을 저장했어요.'); setRevision(n => n + 1); afterProfile.current = null; saved = true; });
    if (saved) pending?.();
  }
  async function publish(event: FormEvent) { event.preventDefault(); await run(async () => {
    const body = { ...postForm, price: postForm.tradeType === 'share' ? 0 : Number(postForm.price), capacity: Number(postForm.capacity), meetingAt: postForm.meetingAt ? new Date(postForm.meetingAt).toISOString() : '' };
    const result = await request<PostDetail>('/posts', 'POST', body); setComposer(false); setPage(1); setCategory('all'); setRegion(''); setDistrict(''); setKeyword(''); setDraft(''); setMine(false); setRevision(n => n + 1); openPost(result.item.post.id); setDetail(result); setToast('이웃들에게 이야기를 전했어요.');
  }); }
  function mutatePost(suffix: string, method: string, body?: unknown) { return run(async () => { const result = await request<PostDetail>(`/posts/${selected}${suffix}`, method, body); setDetail(result); setRevision(n => n + 1); }); }
  function startChat() { withProfile(() => { void run(async () => { const data = await request<ConversationDetail>('/conversations', 'POST', { postId: selected }); setChatId(data.conversation.id); setChat(data); setSelected(''); setInbox(true); setMessage(''); }); }); }
  const pages = Math.ceil((feed?.total || 0) / 12);
  const p = detail?.item.post;
  const profileOptions = regions.length ? regions : [{ code: '11', name: '서울' }];
  const modalError = <ErrorMessage message={error}/>;

  return <main className="community-page">
    <section className="community-hero"><div className="container community-hero-inner"><div><div className="eyebrow"><span/> OUR NEIGHBORHOOD</div><h1>같은 동네, 같은 마음.<br/><span>우리 사이가 가까워지는 곳.</span></h1><p>작은 정보도, 함께 걷는 시간도, 쓰임을 기다리는 물건도.<br/>반려생활의 좋은 것들을 이웃과 나눠보세요.</p><button className="primary-button" disabled={!profileReady} onClick={() => withProfile(openComposer)}><Plus size={17}/> 우리 동네 이야기 쓰기</button></div><div className="community-hero-art" aria-hidden="true"><span className="community-art-ring"/><span className="community-art-paw"><PawPrint size={75}/></span><span className="community-art-note"><Users size={19}/> 산책 친구가 생겼어요</span><span className="community-art-gift"><ShoppingBag size={20}/> 필요한 물건을 나눠요</span><span className="community-art-heart"><Heart size={22} fill="currentColor"/></span></div></div></section>
    <section className="container community-content">
      <PointsPanel onEditProfile={() => openProfile()}/>
      <div className="community-topline"><div><span className="eyebrow">LITTLE TALKS, BIG CONNECTIONS</span><h2>우리 동네 커뮤니티 <Sprout size={24}/></h2><p>함께 키우는 반려생활, 여기서 시작해요.</p></div><div className="community-account-actions"><button className="community-outline" disabled={!profileReady} onClick={() => withProfile(openInbox)}><MessageCircle size={16}/> 내 대화</button><button className="community-profile-button" disabled={!profileReady} onClick={() => openProfile()}><Avatar name={profile?.nickname || '이'}/><span>{profile?.nickname || '이웃 프로필 만들기'}<small>{profile ? location(profile) : '닉네임으로 가볍게 시작해요'}</small></span></button></div></div>
      <div className="community-layout"><aside className="community-sidebar"><div className="community-side-title">이야기 모아보기</div><div className="community-tabs" role="group" aria-label="커뮤니티 종류">{Object.entries(categories).map(([key, label]) => { const Icon = key === 'all' ? PawPrint : icons[key as CommunityCategory]; return <button key={key} className={category === key ? 'active' : ''} aria-pressed={category === key} onClick={() => { setCategory(key); setPage(1); }}><Icon size={17}/>{label}<ChevronRight size={13}/></button>; })}</div><div className="community-side-divider"/><label htmlFor="community-region">어느 동네 이야기인가요?</label><select id="community-region" value={region} onChange={e => { setRegion(e.target.value); setDistrict(''); setPage(1); }}><option value="">전국 모든 이웃</option>{profileOptions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select><select aria-label="커뮤니티 시군구" disabled={!region} value={district} onChange={e => { setDistrict(e.target.value); setPage(1); }}><option value="">시·군·구 전체</option>{districts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}</select>{profile && <button className="community-my-area" onClick={() => { setRegion(profile.region); setDistrict(profile.district); setPage(1); }}><MapPin size={13}/> 내 동네로 보기</button>}<div className="community-neighbor-note"><Heart size={23}/><h3>다정한 이웃이 되어주세요.</h3><p>서로의 경험을 존중하고,<br/>만남은 밝은 공공장소에서.<br/>따뜻한 인사로 시작해요.</p></div></aside>
      <div className="community-feed"><form className="community-search" onSubmit={e => { e.preventDefault(); setKeyword(draft.trim()); setPage(1); }}><Search size={19}/><input aria-label="커뮤니티 검색" placeholder="궁금한 정보, 산책 친구, 필요한 물건 찾기" maxLength={60} value={draft} onChange={e => setDraft(e.target.value)}/>{draft && <button type="button" aria-label="커뮤니티 검색어 지우기" onClick={() => { setDraft(''); setKeyword(''); setPage(1); }}><X size={16}/></button>}<button className="community-search-submit">검색</button></form>
        <div className="community-feed-toolbar"><div><button className={!mine ? 'active' : ''} onClick={() => { setMine(false); setPage(1); }}>이웃 이야기</button><button className={mine ? 'active' : ''} disabled={!profileReady} onClick={() => withProfile(() => { setMine(true); setPage(1); })}>내가 쓴 글</button><span>{loading ? '…' : feedError ? '—' : (feed?.total || 0).toLocaleString()}개의 이야기</span></div><select aria-label="커뮤니티 글 정렬" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="recent">최신순</option><option value="popular">공감 많은 순</option></select></div>
        {keyword && <div className="active-keyword">“{keyword}” 검색 결과 <button aria-label="커뮤니티 검색 해제" onClick={() => { setKeyword(''); setDraft(''); setPage(1); }}><X size={13}/></button></div>}
        {loading ? <div className="community-loading" role="status"><LoaderCircle className="spin" size={23}/>이웃들의 이야기를 불러오고 있어요.</div> : feedError ? <div className="empty-state" role="alert"><Info size={32}/><h3>이야기를 불러오지 못했어요</h3><p>{feedError}</p><button onClick={() => setRevision(n => n + 1)}>다시 시도</button></div> : !feed?.items.length ? <div className="community-empty"><span><Sprout size={38}/></span><h3>{keyword ? '아직 이 이야기는 없네요' : mine ? '첫 이야기를 기다리고 있어요' : '첫 번째 이웃이 되어주세요'}</h3><p>{keyword ? '검색어나 동네를 바꿔 다시 찾아보세요.' : '좋았던 산책길, 궁금한 반려생활, 나누고 싶은 물건까지.\n작은 이야기 하나가 좋은 인연의 시작이 돼요.'}</p><button className="primary-button" disabled={!profileReady} onClick={() => withProfile(openComposer)}>첫 이야기 쓰기 <ArrowRight size={15}/></button></div> : <div className="community-post-list">{feed.items.map(item => <PostCard key={item.post.id} item={item} location={location(item.post)} open={() => openPost(item.post.id)}/>)}</div>}
        {!loading && !feedError && pages > 1 && <nav className="pagination" aria-label="커뮤니티 페이지"><button aria-label="커뮤니티 이전 페이지" disabled={page === 1} onClick={() => setPage(n => n - 1)}><ChevronLeft size={16}/></button><span><b>{page}</b> / {pages}</span><button aria-label="커뮤니티 다음 페이지" disabled={page >= pages} onClick={() => setPage(n => n + 1)}><ChevronRight size={16}/></button></nav>}
        <div className="community-feed-note"><PawPrint size={14}/> 이웃이 직접 나누는 이야기예요. 거래 전 물건과 조건을 함께 확인해주세요.</div>
      </div></div>
    </section>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {profileOpen && <Modal title={profile ? '내 이웃 프로필' : '반가워요, 새로운 이웃!'} close={() => { if (!busy) { setProfileOpen(false); afterProfile.current = null; setError(''); } }}><form className="community-form" onSubmit={saveProfile}><p className="community-form-intro">이웃에게 보여줄 이름과 활동할 동네를 알려주세요.</p>{modalError}<label>닉네임 <input required minLength={2} maxLength={16} placeholder="예: 보리네" autoComplete="nickname" value={profileForm.nickname} onChange={e => setProfileForm({ ...profileForm, nickname: e.target.value })}/></label><label>반려동물 이름 <span className="community-optional">선택</span><input maxLength={20} placeholder="함께하는 아이의 이름" value={profileForm.petName} onChange={e => setProfileForm({ ...profileForm, petName: e.target.value })}/></label><div className="community-form-row"><label>지역<select value={profileForm.region} onChange={e => setProfileForm({ ...profileForm, region: e.target.value, district: '' })}>{profileOptions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label><label>동네<select value={profileForm.district} onChange={e => setProfileForm({ ...profileForm, district: e.target.value })}><option value="">시·군·구 전체</option>{profileDistricts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}</select></label></div><p className="community-session-note"><Info size={15}/> 이 브라우저에 연결되는 간편 프로필이에요. 쿠키를 지우거나 다른 기기를 쓰면 기존 프로필에 접속할 수 없어요. 동네는 직접 선택하며 위치 인증은 제공하지 않아요.</p><button className="primary-button" disabled={busy}>{busy ? '저장 중…' : '이웃 프로필 저장'}<PawPrint size={16}/></button></form></Modal>}
    {composer && <Modal title="이웃에게 이야기 전하기" close={() => { if (!busy && !photoBusy) { setComposer(false); setError(''); } }}><form className="community-form" onSubmit={publish}>{modalError}<div className="community-compose-types">{(['info', 'walk', 'market'] as CommunityCategory[]).map(type => <button key={type} type="button" aria-pressed={postForm.category === type} className={postForm.category === type ? 'active' : ''} onClick={() => setPostForm({ ...postForm, category: type })}>{categories[type]}</button>)}</div><label>제목<input required minLength={2} maxLength={80} value={postForm.title} placeholder={postForm.category === 'market' ? '어떤 물건을 나누고 싶나요?' : postForm.category === 'walk' ? '어떤 이웃과 함께하고 싶나요?' : '이웃과 나누고 싶은 이야기는?'} onChange={e => setPostForm({ ...postForm, title: e.target.value })}/></label><div className="community-form-row"><label>지역<select value={postForm.region} onChange={e => setPostForm({ ...postForm, region: e.target.value, district: '' })}>{profileOptions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label><label>동네<select value={postForm.district} onChange={e => setPostForm({ ...postForm, district: e.target.value })}><option value="">시·군·구 전체</option>{postDistricts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}</select></label></div>
      {postForm.category === 'market' && <div className="community-form-row"><label>거래 방식<select value={postForm.tradeType} onChange={e => setPostForm({ ...postForm, tradeType: e.target.value })}><option value="sale">중고 판매</option><option value="share">무료 나눔</option></select></label>{postForm.tradeType === 'sale' && <label>가격 (원)<input type="number" min={0} max={100000000} step={1} required value={postForm.price} placeholder="가격을 입력해주세요" onChange={e => setPostForm({ ...postForm, price: e.target.value })}/></label>}</div>}
      {postForm.category === 'walk' && <><div className="community-form-row"><label>만날 날짜·시간<input type="datetime-local" required value={postForm.meetingAt} onChange={e => setPostForm({ ...postForm, meetingAt: e.target.value })}/></label><label>정원 (주최자 포함)<input type="number" min={2} max={30} required value={postForm.capacity} onChange={e => setPostForm({ ...postForm, capacity: e.target.value })}/></label></div><label>만날 장소<input required minLength={2} maxLength={80} placeholder="예: 서울숲 3번 출입구 앞" value={postForm.meetingPlace} onChange={e => setPostForm({ ...postForm, meetingPlace: e.target.value })}/></label></>}
      <label>내용<textarea required minLength={5} maxLength={5000} rows={6} value={postForm.content} placeholder={postForm.category === 'market' ? '물건의 상태, 사용 기간, 거래할 장소를 자세히 적어주세요. 반려동물 생체 거래는 허용하지 않아요.' : '이웃이 알면 좋은 내용을 자유롭게 적어주세요. 공개 글에 연락처나 상세 주소를 남기지 마세요.'} onChange={e => setPostForm({ ...postForm, content: e.target.value })}/><small className="community-text-count">{postForm.content.length} / 5,000</small></label><div className="community-photo-field"><label className="community-photo-add"><ImagePlus size={21}/><span>{photoBusy ? '사진 준비 중…' : '사진 1장 첨부'}<small>JPG·PNG·WebP, 최대 10MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy || busy} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setPhotoBusy(true); setError(''); try { const image = await preparePhoto(file); setPostForm(current => ({ ...current, image })); } catch (ex) { setError((ex as Error).message); } finally { setPhotoBusy(false); } }}/></label>{postForm.image && <div className="community-photo-preview"><img src={postForm.image} alt="첨부할 사진"/><button type="button" aria-label="첨부 사진 삭제" onClick={() => setPostForm({ ...postForm, image: '' })}><X size={15}/></button></div>}</div><button className="primary-button" disabled={busy || photoBusy}>{busy ? '이야기 전하는 중…' : '이야기 등록하기'}<Send size={16}/></button></form></Modal>}
    {selected && <Modal title="우리 동네 이야기" close={() => { if (!busy) { setSelected(''); setError(''); } }}>{modalError}{!detail ? <div className="community-loading"><LoaderCircle className="spin"/>이야기를 불러오고 있어요.</div> : p && <div className="community-post-detail"><div className="community-detail-tags"><Badge category={p.category}/>{p.category !== 'info' && <span className={`community-status ${p.status}`}>{postStatus(p)}</span>}</div><h2>{p.title}</h2><div className="community-author"><Avatar name={detail.item.author.nickname}/><div><strong>{detail.item.author.nickname}{detail.item.author.petName && <small> · {detail.item.author.petName} 보호자</small>}</strong><span>{location(p)} · {date(p.createdAt)}</span></div></div>{p.image && <img className="community-detail-photo" src={p.image} alt={`${p.title} 첨부 사진`}/>}{p.category === 'market' && <div className="community-detail-price">{postPrice(p)}</div>}{p.category === 'walk' && <div className="community-meeting"><span><Clock3 size={16}/>{date(p.meetingAt)}</span><span><MapPin size={16}/>{p.meetingPlace}</span><span><Users size={16}/>{detail.item.participantCount} / {p.capacity}명 참여</span></div>}<p className="community-post-body">{p.content}</p><div className="community-detail-actions"><button className={`community-outline ${detail.item.liked ? 'liked' : ''}`} disabled={busy} aria-pressed={detail.item.liked} onClick={() => withProfile(() => { void mutatePost('/like', 'PUT', { enabled: !detail.item.liked }); })}><Heart size={16} fill={detail.item.liked ? 'currentColor' : 'none'}/> 공감 {detail.item.likeCount}</button>{!detail.item.mine && <button className="community-outline" disabled={busy} onClick={startChat}><MessageCircle size={16}/> 1:1 대화</button>}{p.category === 'walk' && !detail.item.mine && <button className="primary-button" disabled={busy || (!detail.item.joined && (postStatus(p) === '모집 마감' || detail.item.participantCount >= p.capacity))} onClick={() => withProfile(() => { void mutatePost('/join', 'PUT', { enabled: !detail.item.joined }); })}>{detail.item.joined ? '참여 취소' : detail.item.participantCount >= p.capacity ? '정원 마감' : '함께 산책하기'}</button>}</div>
      {detail.item.mine && <div className="community-owner-actions">{p.category !== 'info' && <label>글 상태<select aria-label="글 상태 변경" disabled={busy} value={p.status} onChange={e => { void mutatePost('/status', 'PUT', { status: e.target.value }); }}><option value="open">{p.category === 'market' ? '거래 가능' : '모집 중'}</option>{p.category === 'market' && <option value="reserved">예약 중</option>}<option value="done">{p.category === 'market' ? '거래 완료' : '모집 마감'}</option></select></label>}{deleteConfirm ? <div className="community-delete-confirm"><span>이 글과 댓글을 삭제할까요?</span><button disabled={busy} onClick={() => { void run(async () => { await request(`/posts/${selected}`, 'DELETE'); setSelected(''); setRevision(n => n + 1); setPage(1); setToast('이야기를 삭제했어요.'); }); }}>삭제</button><button onClick={() => setDeleteConfirm(false)}>취소</button></div> : <button className="community-delete" onClick={() => setDeleteConfirm(true)}><Trash2 size={14}/> 글 삭제</button>}</div>}
      <section className="community-comments"><h3>이웃의 한마디 <span>{detail.comments.length}</span></h3>{detail.comments.length ? detail.comments.map(c => <div className="community-comment" key={c.comment.id}><Avatar name={c.author.nickname}/><div><strong>{c.author.nickname}</strong><p>{c.comment.content}</p><small>{date(c.comment.createdAt)}</small></div>{c.mine && <button disabled={busy} aria-label="내 댓글 삭제" onClick={() => { void mutatePost(`/comments/${c.comment.id}`, 'DELETE'); }}><Trash2 size={14}/></button>}</div>) : <p className="community-no-comments">따뜻한 첫마디를 남겨보세요.</p>}<form className="community-comment-form" onSubmit={e => { e.preventDefault(); withProfile(() => { void run(async () => { const data = await request<PostDetail>(`/posts/${selected}/comments`, 'POST', { content: comment }); setDetail(data); setComment(''); setRevision(n => n + 1); }); }); }}><textarea aria-label="댓글 내용" required maxLength={1000} rows={2} value={comment} placeholder="이웃에게 한마디 남겨보세요" onChange={e => setComment(e.target.value)}/><button className="primary-button" disabled={busy || !comment.trim()}>댓글 등록<Send size={14}/></button></form></section></div>}</Modal>}
    {inbox && <Modal title="이웃과 나누는 대화" wide close={() => { if (!busy) { setInbox(false); setError(''); } }}>{modalError}<div className={`community-inbox ${chatId ? 'chat-selected' : ''}`}><aside className="community-conversations"><h3>내 대화 <span>{conversations.length}</span></h3>{inboxLoading && !conversations.length ? <p className="community-chat-help">대화를 불러오는 중이에요.</p> : !conversations.length ? <p className="community-chat-help">아직 나눈 대화가 없어요.<br/>이웃의 글에서 1:1 대화를 시작해보세요.</p> : conversations.map(c => <button key={c.id} className={chatId === c.id ? 'active' : ''} onClick={() => { setChatId(c.id); setChat(null); setMessage(''); setError(''); }}><Avatar name={c.neighbor.nickname}/><span><strong>{c.neighbor.nickname}</strong><small>{c.title}</small><p>{c.lastMessage}</p></span></button>)}</aside><section className="community-chat">{chatId ? <><div className="community-chat-heading"><button aria-label="대화 목록으로" className="community-chat-back" onClick={() => { setChatId(''); setChat(null); }}><ChevronLeft size={20}/></button><div><strong>{chat?.conversation.neighbor.nickname || '이웃과의 대화'}</strong><p>{chat?.conversation.title || '대화를 불러오는 중이에요.'}</p></div></div><div className="community-messages" aria-live="polite">{chat?.messages.length ? chat.messages.map(m => <div className={`community-message ${m.mine ? 'mine' : ''}`} key={m.message.id}><p>{m.message.content}</p><time>{date(m.message.createdAt)}</time></div>) : <p className="community-chat-help">가벼운 인사로 대화를 시작해보세요.<br/>연락처나 계좌번호는 신중하게 공유해주세요.</p>}<div ref={messageEnd}/></div><form className="community-send" onSubmit={e => { e.preventDefault(); void run(async () => { const data = await request<ConversationDetail>(`/conversations/${chatId}/messages`, 'POST', { content: message }); setChat(data); setMessage(''); setRevision(n => n + 1); }); }}><textarea aria-label="대화 메시지" rows={2} maxLength={1000} required value={message} placeholder="메시지를 입력해주세요" onChange={e => setMessage(e.target.value)}/><button className="primary-button" aria-label="메시지 보내기" disabled={busy || !message.trim()}><Send size={18}/></button></form></> : <div className="community-chat-placeholder"><MessageCircle size={36}/><h3>이야기를 나눠보세요</h3><p>함께 걸을 약속도, 물건에 대한 궁금증도.<br/>대화를 선택하면 여기에서 이어갈 수 있어요.</p></div>}</section></div></Modal>}
  </main>;
}

function PostCard({ item, location, open }: { item: PostView; location: string; open: () => void }) {
  const p = item.post; const Icon = icons[p.category];
  return <article className={`community-post-card ${p.category}`}><button className="community-post-open" onClick={open}><div className="community-card-main"><div className="community-card-tags"><Badge category={p.category}/>{p.category !== 'info' && <span className={`community-status ${p.status}`}>{postStatus(p)}</span>}</div><h3>{p.title}</h3><p className="community-excerpt">{p.content}</p>{p.category === 'market' && <strong className="community-card-price">{postPrice(p)}</strong>}{p.category === 'walk' && <div className="community-card-meeting"><Clock3 size={13}/>{date(p.meetingAt)}<span>· {item.participantCount}/{p.capacity}명</span></div>}<div className="community-card-meta"><span>{item.author.nickname} · {location}</span><time>{date(p.createdAt)}</time></div></div>{p.image ? <img className="community-card-thumbnail" src={p.image} alt={`${p.title} 첨부 사진`} loading="lazy"/> : <div className={`community-card-symbol ${p.category}`} aria-hidden="true"><Icon size={31}/></div>}</button><div className="community-card-footer"><span><MapPin size={12}/>{location}</span><div><span><Heart size={13} fill={item.liked ? 'currentColor' : 'none'}/>{item.likeCount}</span><span><MessageCircle size={13}/>{item.commentCount}</span></div></div></article>;
}
