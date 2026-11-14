import PointsPanel from './PointsPanel';
import { useMemberProfile } from './MemberProfile';
export default function ShopPoints() {
  const { openProfile } = useMemberProfile();
  return <section id="shop-points" className="shop-points" aria-label="포인트 적립 및 내역">
    <div className="shop-section-title"><div><span className="shop-eyebrow">MY POINTS</span><h2>함께 모으는 포인트</h2></div><button className="shop-profile-edit" onClick={openProfile}>프로필 설정</button></div>
    <PointsPanel/>
  </section>;
}
