import { dogSizes, type DogSize } from './dog-profiles';
import type { WalkConditions } from './community-api';

const flags = [
  { key: 'stairs', label: '계단', yes: '있음', no: '없음' },
  { key: 'shade', label: '그늘', yes: '있음', no: '없음' },
  { key: 'quiet', label: '조용한 코스', yes: '예', no: '아니요' },
] as const;

export default function WalkConditionsFields({ walk, onChange }: {
  walk: WalkConditions | null;
  onChange: (walk: WalkConditions | null) => void;
}) {
  return <div className="walk-conditions">
    <label className="dog-check">
      <input type="checkbox" checked={walk !== null} onChange={event => onChange(event.target.checked
        ? { minutes: 30, sizes: [], stairs: null, shade: null, quiet: null } : null)}/>
      산책 코스 조건 추가
    </label>
    {walk && <fieldset>
      <legend>반려견 맞춤 추천에 표시할 조건</legend>
      <label>예상 산책 시간 (분)<input required type="number" min={1} max={600}
        value={Number.isNaN(walk.minutes) ? '' : walk.minutes}
        onChange={event => onChange({ ...walk, minutes: event.target.valueAsNumber })}/></label>
      <div role="group" aria-label="함께 걸을 수 있는 반려견 크기" className="walk-sizes">
        <span>함께 걸을 수 있는 크기</span>
        {Object.entries(dogSizes).map(([value, label], index) => {
          const size = value as DogSize;
          const checked = walk.sizes.includes(size);
          return <label className="dog-check" key={size}>
            <input type="checkbox" checked={checked} required={index === 0 && walk.sizes.length === 0}
              onChange={event => onChange({ ...walk, sizes: event.target.checked ? [...walk.sizes, size] : walk.sizes.filter(item => item !== size) })}/>
            {label}
          </label>;
        })}
      </div>
      <div className="walk-flags">{flags.map(({ key, label, yes, no }) => <label key={key}>{label}
        <select value={walk[key] == null ? '' : String(walk[key])}
          onChange={event => onChange({ ...walk, [key]: event.target.value === '' ? null : event.target.value === 'true' })}>
          <option value="">확인 안 됨</option><option value="true">{yes}</option><option value="false">{no}</option>
        </select>
      </label>)}</div>
    </fieldset>}
  </div>;
}
