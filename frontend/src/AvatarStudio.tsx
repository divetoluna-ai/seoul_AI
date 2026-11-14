import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Box, Check, Download, Home, PawPrint, Plus, RotateCcw, Save, Shirt, Sparkles, Trash2 } from 'lucide-react';
import './avatar-studio.css';
import { Wardrobe } from './AvatarCustomization';
import { OUTFITS, type Species } from './avatar-catalog';
import {REAL_MODELS,realModelFor} from './real-model-catalog';
const AvatarScene = lazy(() => import('./AvatarScene'));
type FurnitureType = 'bed' | 'sofa' | 'plant' | 'bowl';
type Furniture = { id: string; type: FurnitureType; color: string; x: number; z: number; rotation: number };
export type StudioDesign = { name: string; renderMode: 'realistic'; species: Species; breedId: string; outfitId: string; fitEase:number; fitLength:number; fitWidth:number; fur: string; size: number; ears: number; rotation: number; collarEnabled: boolean; collar: string; wall: string; floor: string; rug: boolean; rugColor: string; furniture: Furniture[] };
const KEY = 'daeng-avatar-studio-v1';
const labels: Record<FurnitureType, string> = { bed: '포근한 방석', sofa: '작은 소파', plant: '초록 식물', bowl: '물그릇' };
const initial = (): StudioDesign => ({ name: '몽이', renderMode:'realistic', species: 'dog', breedId: 'mix-dog', outfitId: 'none', fitEase:.035,fitLength:1,fitWidth:1,fur: '#d7ad79', size: 1, ears: 1, rotation: 15, collarEnabled: true, collar: '#718c76', wall: '#dbe2cf', floor: '#d7bd99', rug: true, rugColor: '#eae0c9', furniture: [ { id: 'bed', type: 'bed', color: '#9eaf96', x: -1.8, z: .8, rotation: 15 }, { id: 'sofa', type: 'sofa', color: '#d6b496', x: 1.5, z: -2.15, rotation: 0 }, { id: 'plant', type: 'plant', color: '#cc997d', x: -2.5, z: -2.4, rotation: 0 }, { id: 'bowl', type: 'bowl', color: '#789a97', x: 1.65, z: 1.3, rotation: 0 } ] });
const colorValid = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
function load(): StudioDesign {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || !['dog', 'cat', 'rabbit'].includes(d.species) || typeof d.name !== 'string' || d.name.length > 20) return initial();
    for (const key of ['fur', 'collar', 'wall', 'floor', 'rugColor']) if (!colorValid(d[key])) return initial();
    for (const [key, min, max] of [['size', .7, 1.3], ['ears', .6, 1.4], ['rotation', -180, 180]] as const) if (!Number.isFinite(d[key]) || d[key] < min || d[key] > max) return initial();
    if (typeof d.rug !== 'boolean' || typeof d.collarEnabled !== 'boolean' || !Array.isArray(d.furniture) || d.furniture.length > 12) return initial();
    if (!d.furniture.every((f: Furniture) => f && typeof f.id === 'string' && Object.hasOwn(labels, f.type) && colorValid(f.color) && Number.isFinite(f.x) && Math.abs(f.x) <= 2.5 && Number.isFinite(f.z) && Math.abs(f.z) <= 2.5 && Number.isFinite(f.rotation) && Math.abs(f.rotation) <= 180)) return initial();
    d.renderMode='realistic';
    // Migrate existing designs while retaining the room and accessories.
    if (d.species === 'rabbit') d.species = 'dog';
    d.breedId = realModelFor(typeof d.breedId === 'string' ? d.breedId : '', d.species).id;
    d.fitEase=Number.isFinite(d.fitEase)?Math.max(.015,Math.min(.09,d.fitEase)):.035;
    d.fitWidth=Number.isFinite(d.fitWidth)?Math.max(.85,Math.min(1.15,d.fitWidth)):1;
    d.fitLength=Number.isFinite(d.fitLength)?Math.max(.75,Math.min(1.1,d.fitLength)):1;
    d.outfitId = OUTFITS.some(o => o.id === d.outfitId) ? d.outfitId : 'none';
    return d;
  } catch { return initial(); }
}
function ColorPicker({ label, value, onChange, colors }: {label: string; value: string; onChange: (c: string) => void; colors: string[]}) {
  return <div className="studio-field"><span>{label}</span><div className="studio-swatches">{colors.map(c => <button key={c} style={{ background: c }} className={value === c ? 'chosen' : ''} aria-label={`${label} ${c}`} aria-pressed={value === c} onClick={() => onChange(c)}>{value === c && <Check size={13}/>}</button>)}<label className="studio-custom-color" title="직접 색상 선택"><Plus size={14}/><input type="color" aria-label={`${label} 직접 선택`} value={value} onChange={e => onChange(e.target.value)}/></label></div></div>;
}
function Slider({label, value, min, max, step = 1, onChange, unit = ''}: {label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; unit?: string}) {
  return <label className="studio-slider"><span>{label}<output>{value.toFixed(step < .01 ? 3 : step < .1 ? 2 : step < 1 ? 1 : 0)}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>;
}
export default function AvatarStudio() {
  const [design, setDesign] = useState<StudioDesign>(load);
  const [panel, setPanel] = useState<'pet' | 'room' | 'outfit'>('pet');
  const [selection, setSelection] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); }, [message]);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState(0);
  const captureRef = useRef<(() => void) | null>(null);
  const change = (patch: Partial<StudioDesign>) => { setDesign(d => ({ ...d, ...patch })); setDirty(true); setMessage(''); };
  const selected = design.furniture.find(f => f.id === selection);
  const model=realModelFor(design.breedId,design.species);
  const changeFurniture = (patch: Partial<Furniture>) => change({ furniture: design.furniture.map(f => f.id === selection ? { ...f, ...patch } : f) });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(design)); setDirty(false); setMessage('이 브라우저에 디자인을 저장했어요.'); } catch { setMessage('저장 공간을 사용할 수 없어요. 이미지로 남겨주세요.'); } };
  return <main className="studio-page container">
    <div className="studio-heading"><div><div className="eyebrow"><Sparkles size={13}/> MY LITTLE WORLD</div><h1>우리 아이의 작은 세상<span>.</span></h1><p>닮은 모습부터 좋아하는 공간까지, 상상하는 대로 만들어보세요.</p></div><button className="studio-save" onClick={save}><Save size={16}/> 디자인 저장</button></div>
    <div className="studio-workspace">
      <section className="studio-preview" aria-label="3D 디자인 미리보기">
        <div className="studio-preview-top"><span><span className="studio-live-dot"/> LIVE 3D STUDIO</span><span>{dirty ? '저장하지 않은 변경사항' : '나만의 작은 공간'}</span></div>
        <Suspense fallback={<div className="studio-loading">작은 세상을 만들고 있어요…</div>}><AvatarScene design={design} captureRef={captureRef} view={view} focus={panel !== 'room' && !(model.rig||model.motion)}/></Suspense>
        <div className="studio-name"><PawPrint size={16}/><span>{design.name || '우리 아이'}의 방</span><small>{model.name} · {model.rig||model.motion ? '자유 동작' : '3D 모델'}</small></div>
        <div className="studio-preview-bottom"><span>드래그로 회전 · 스크롤로 확대 · 오른쪽 드래그로 이동</span><div><button aria-label="시점 초기화" title="시점 초기화" onClick={() => setView(v => v + 1)}><RotateCcw size={16}/></button><button title="이미지 저장" onClick={() => { if (captureRef.current) { captureRef.current(); setMessage('미리보기를 이미지로 내려받았어요.'); } else setMessage('3D 화면이 준비되면 다시 시도해주세요.'); }}><Download size={16}/><span>이미지</span></button></div></div>
      </section>
      <aside className="studio-editor" aria-label="아바타와 공간 편집">
        <div className="studio-tabs" role="tablist" aria-label="디자인 대상"><button id="pet-tab" role="tab" aria-selected={panel === 'pet'} aria-controls="studio-panel" onClick={() => setPanel('pet')}><PawPrint size={16}/> 반려동물</button><button id="outfit-tab" role="tab" aria-selected={panel === 'outfit'} aria-controls="studio-panel" onClick={() => setPanel('outfit')}><Shirt size={16}/> 옷장</button><button id="room-tab" role="tab" aria-selected={panel === 'room'} aria-controls="studio-panel" onClick={() => setPanel('room')}><Home size={16}/> 공간</button></div>
        <div id="studio-panel" className="studio-panel" role="tabpanel" aria-labelledby={`${panel}-tab`}>
          {panel === 'pet' ? <>
            <div className="studio-section-title"><span>01</span><h2>어떤 아이와 함께하나요?</h2></div>
            <div className="studio-species">{([['dog','강아지','🐶'],['cat','고양이','🐱']] as const).map(([id,label,emoji]) => <button key={id} aria-pressed={design.species === id} className={design.species === id ? 'selected' : ''} onClick={() => change({species:id,breedId:realModelFor('',id).id,fitEase:.035,fitLength:1,fitWidth:1})}><span>{emoji}</span>{label}</button>)}</div>
            <label className="studio-input">품종 · 실제 3D 모델<select value={realModelFor(design.breedId,design.species).id} onChange={e=>change({breedId:e.target.value,fitEase:.035,fitLength:1,fitWidth:1})}>{REAL_MODELS.filter(m=>m.species===design.species).map(m=><option key={m.id} value={m.id}>{m.name} · {m.detail}</option>)}</select></label>
            <div className="studio-model-card"><img src={`/models/realistic/${model.slug}.${model.thumbnail??'webp'}`} alt={`${realModelFor(design.breedId,design.species).name} 원본 모델`}/><span>{realModelFor(design.breedId,design.species).detail}</span></div>
            <p className="studio-model-note">{model.textureLabel??'4K 원본 텍스처'} · {model.name} 3D 모델<br/><a href={model.source?.url??`https://grab3d.com/models/animals/${model.slug}/`} target="_blank" rel="noreferrer">모델 출처: {model.source?.credit??'Grab3D · CC0 · AI 제작 에셋'}</a>{(model.rig||model.motion)&&<><br/>방 안 걷기 · 앉기 · 엎드리기가 자동으로 이어져요.</>}</p>
            <label className="studio-input">아이 이름<input value={design.name} maxLength={20} onChange={e => change({name:e.target.value})} placeholder="이름을 지어주세요"/></label>
            <div className="studio-divider"/><div className="studio-section-title"><span>02</span><h2>모델 조절</h2></div>
            <Slider label="몸 크기" value={design.size} min={.7} max={1.3} step={.1} onChange={size => change({size})}/>
            {!(model.rig||model.motion)&&<Slider label="바라보는 방향" value={design.rotation} min={-180} max={180} onChange={rotation => change({rotation})} unit="°"/>}
          </> : panel === 'outfit' ? <><div className="studio-fit-controls"><h2>우리 아이에게 맞추기</h2><Slider label="옷 품" value={(design.fitWidth??1)*100} min={85} max={115} step={1} unit="%" onChange={v=>change({fitWidth:v/100})}/><Slider label="몸과의 여유" value={(design.fitEase??.035)*100} min={1.5} max={9} step={.5} unit="cm" onChange={v=>change({fitEase:v/100})}/><Slider label="옷 길이" value={(design.fitLength??1)*100} min={75} max={110} step={5} unit="%" onChange={v=>change({fitLength:v/100})}/><button onClick={()=>change({fitEase:.035,fitLength:1,fitWidth:1})}>이 모델의 기본 핏</button></div><Wardrobe outfitId={design.outfitId} onChange={outfitId => change({outfitId})}/></> : <><div className="studio-section-title"><span>01</span><h2>공간의 분위기</h2></div><ColorPicker label="벽 색상" value={design.wall} onChange={wall => change({wall})} colors={['#dbe2cf','#e8d9cf','#d1dfe5','#eee5d4','#dcd5e4']}/><ColorPicker label="바닥 색상" value={design.floor} onChange={floor => change({floor})} colors={['#d7bd99','#b08c69','#e6dac6','#b8b6ae','#897766']}/><label className="studio-toggle"><span>포근한 러그</span><input type="checkbox" checked={design.rug} onChange={e => change({rug:e.target.checked})}/></label>{design.rug && <ColorPicker label="러그 색상" value={design.rugColor} onChange={rugColor => change({rugColor})} colors={['#eae0c9','#b3c3ac','#d9b1a5','#a9c2cf','#c4b5cb']}/>}<div className="studio-divider"/><div className="studio-section-title"><span>02</span><h2>좋아하는 것들로 채워요</h2></div><div className="studio-add-furniture">{(Object.keys(labels) as FurnitureType[]).map(type => <button key={type} disabled={design.furniture.length >= 12} onClick={() => { const f = {id:crypto.randomUUID(),type,color:({bed:'#9eaf96',sofa:'#d6b496',plant:'#cc997d',bowl:'#789a97'})[type],x:0,z:1.8,rotation:0}; change({furniture:[...design.furniture,f]}); setSelection(f.id); }}><Plus size={12}/>{labels[type]}</button>)}</div><p className="studio-hint">가구를 선택해 위치와 색상을 바꿔보세요. ({design.furniture.length}/12)</p><div className="studio-furniture-list">{design.furniture.map((f,i) => <button key={f.id} aria-pressed={selection === f.id} className={selection === f.id ? 'selected' : ''} onClick={() => setSelection(f.id)}><Box size={13}/>{labels[f.type]}<span>{String(i+1).padStart(2,'0')}</span></button>)}</div>{selected && <div className="studio-object-editor"><div><strong>{labels[selected.type]} 배치</strong><button aria-label="선택한 가구 삭제" onClick={() => {change({furniture:design.furniture.filter(f => f.id !== selection)});setSelection(null);}}><Trash2 size={14}/></button></div><Slider label="좌우 위치" min={-2.5} max={2.5} step={.1} value={selected.x} onChange={x => changeFurniture({x})}/><Slider label="앞뒤 위치" min={-2.5} max={2.5} step={.1} value={selected.z} onChange={z => changeFurniture({z})}/><Slider label="회전" min={-180} max={180} value={selected.rotation} onChange={rotation => changeFurniture({rotation})} unit="°"/><ColorPicker label="가구 색상" value={selected.color} onChange={color => changeFurniture({color})} colors={['#9eaf96','#d6b496','#cc997d','#789a97','#c4b5cb']}/></div>}</>}
        </div><div className="studio-editor-foot"><Sparkles size={14}/> 작은 변화도, 우리 아이답게.</div>
      </aside>
    </div><div className="studio-bottom"><span>디자인은 이 기기의 브라우저에 저장돼요.</span><button onClick={() => { if (window.confirm('반려동물과 공간을 기본 디자인으로 되돌릴까요? 저장 버튼을 누르기 전에는 기존 저장본이 유지됩니다.')) { setDesign(initial()); setDirty(true); setSelection(null); setMessage('기본 디자인으로 되돌렸어요.'); } }}><RotateCcw size={13}/> 기본 디자인으로</button></div>{message && <div className="studio-message" role="status"><Check size={16}/>{message}</div>}
  </main>;
}
