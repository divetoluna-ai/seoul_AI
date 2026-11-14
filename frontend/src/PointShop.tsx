import { useEffect, useState } from 'react';
import { ArrowUpRight, Coins, PawPrint, Search, ShoppingBag } from 'lucide-react';

import { communityApi } from './community-api';
import type { Points } from './nfc';
import { missingPoints, requiredPoints, selectProducts, type Catalog } from './shop';
import './shop.css';
import ShopPoints from './ShopPoints';
import { useMemberProfile } from './MemberProfile';
import { profileComplete } from './member-profile';

const number = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
export default function PointShop() {
  const { profile, openProfile } = useMemberProfile();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');
  const [affordable, setAffordable] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError('');
    fetch('/api/auth/shop/products', { credentials: 'same-origin', signal: abort.signal })
      .then(async response => { if (response.status === 401) window.dispatchEvent(new Event('auth-session-expired')); if (!response.ok) throw new Error('상품 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'); return response.json() as Promise<Catalog>; })
      .then(setCatalog).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [revision]);
  useEffect(() => {
    const abort = new AbortController(); let loading = false;
    const refresh = async () => {
      if (loading) return; loading = true;
      try {
        const data = await communityApi<{profile: unknown}>('/profile', 'GET', undefined, abort.signal);
        const points = data.profile ? await communityApi<Points>('/points', 'GET', undefined, abort.signal) : null;
        if (!abort.signal.aborted) { setBalance(points?.total ?? null); setBalanceError(''); }
      } catch { if (!abort.signal.aborted) setBalanceError('보유 포인트를 확인하지 못했어요.'); }
      finally { loading = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 15000);
    window.addEventListener('community-points-changed', refresh);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('community-points-changed', refresh); };
  }, []);
  const products = selectProducts(catalog?.products || [], query, affordable, balance, sort);
  return <main className="container point-shop">
    <div className="shop-breadcrumb">댕댕여지도 <span>/</span> 포인트 상점</div>
    <section className="shop-hero">
      <div><span className="shop-eyebrow"><PawPrint size={15}/> 함께 쌓은 시간, 작은 선물로</span><h1>우리 아이를 위한<br/>포인트 상점<span>.</span></h1><p>산책하고, 코스를 나누고, 차곡차곡 모은 포인트.<br/>어도러블독의 반려견 용품을 둘러보세요.</p><span className="shop-rate">1 P = 1 원</span></div>
      <aside className="shop-wallet" aria-label="보유 포인트"><Coins size={28}/><span>내가 모은 포인트</span><strong>{balance === null ? '—' : number(balance)} <small>P</small></strong><p>{balanceError || (balance === null ? '프로필에서 반려견을 등록하고 포인트를 모아보세요.' : '현재 보유 포인트 기준으로 비교해요.')}</p><button className="shop-wallet-action" onClick={() => { if (!profileComplete(profile)) openProfile(); else document.getElementById('shop-points')?.scrollIntoView({ behavior: 'smooth' }); }}>{balance === null ? '프로필 설정' : '포인트 적립·내역 보기'} <ArrowUpRight size={16}/></button></aside>
    </section>
    <div className="shop-notice"><ShoppingBag size={20}/><p><strong>포인트로 만날 선물을 미리 골라보세요.</strong><span>현재는 상품 조회와 필요 포인트 안내를 제공해요. 포인트 결제·주문·배송은 아직 연동 전이며, 상품 보기를 눌러도 포인트가 차감되지 않아요.</span></p></div>
    <ShopPoints/>
    <section aria-label="상품 목록">
      <div className="shop-section-title"><div><span className="shop-eyebrow">ADORABLE DOG COLLECTION</span><h2>반려견을 위한 발견 <small>{catalog?.products.length ?? 0}</small></h2></div><a href="https://www.adorable-dog.com/" target="_blank" rel="noopener noreferrer">어도러블독 방문 <ArrowUpRight size={16}/></a></div>
      <div className="shop-toolbar"><label className="shop-search"><Search size={18}/><input aria-label="상품명 검색" placeholder="어떤 선물을 찾으세요?" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="shop-affordable"><input type="checkbox" checked={affordable} onChange={e => setAffordable(e.target.checked)}/> 보유 포인트 이내</label><select aria-label="상품 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="default">쇼핑몰 순서</option><option value="low">낮은 포인트순</option><option value="high">높은 포인트순</option></select></div>
      {error && <div className="shop-empty" role="alert"><p>{error}</p><button className="primary-button" onClick={() => setRevision(n => n + 1)}>다시 불러오기</button></div>}
      {!catalog && !error && <p className="shop-empty" role="status">어도러블독 상품을 가져오고 있어요…</p>}
      {catalog && <><p className="shop-result" role="status">{products.length}개의 상품{affordable && balance === null ? ' · 프로필을 만들면 보유 포인트로 비교할 수 있어요.' : ''}</p><div className="shop-grid">{products.map(p => <article className="shop-product" key={p.id}><a className="shop-photo" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={p.name + ' 원본 상품 보기'}><img src={p.image} alt={p.name} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/placeholder.svg'; }}/>{p.soldOut && <span className="shop-stock">품절</span>}</a><div className="shop-product-body"><small>어도러블독</small><h3>{p.name}</h3><strong className="shop-price">{number(requiredPoints(p.priceWon))} <span>P</span></strong><p className="shop-won">상품가 {number(p.priceWon)}원 기준</p><p className={'shop-gap ' + (balance !== null && missingPoints(p.priceWon, balance) === 0 ? 'enough' : '')}>{p.soldOut ? '쇼핑몰에서 재입고 여부를 확인해주세요.' : balance === null ? '프로필 설정 후 보유 포인트 비교' : missingPoints(p.priceWon, balance) === 0 ? '보유 포인트로 필요한 금액을 채웠어요' : number(missingPoints(p.priceWon, balance)) + 'P 더 모으면 필요 포인트 달성'}</p><a className="shop-product-link" href={p.url} target="_blank" rel="noopener noreferrer">원본 상품 보기 <ArrowUpRight size={16}/></a></div></article>)}</div>{!products.length && <div className="shop-empty"><ShoppingBag size={32}/><p>{affordable ? '조건에 맞는 상품이 아직 없어요. 포인트를 더 모아보세요.' : '검색한 상품이 없어요. 다른 이름으로 찾아보세요.'}</p><button className="secondary-button" onClick={() => { setQuery(''); setAffordable(false); }}>전체 상품 보기</button></div>}<p className="shop-source">상품·사진 출처: <a href={catalog.source} target="_blank" rel="noopener noreferrer">어도러블독</a> · 확인 {new Date(catalog.fetchedAt).toLocaleString('ko-KR')}{catalog.stale ? ' · 연결 지연으로 마지막 확인 정보를 표시해요.' : ''}<br/>쇼핑몰 메인에 공개된 상품을 1시간 간격으로 갱신해요. 가격·옵션·재고는 원본 상품 페이지를 확인해주세요. 배송비와 옵션 추가 금액은 필요 포인트에 포함되지 않아요.</p></>}
    </section>
  </main>;
}
