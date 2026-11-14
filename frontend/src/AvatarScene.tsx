import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { StudioDesign } from './AvatarStudio';
import { buildRealPet, type LivePet } from './avatar-realistic';
import {realModelFor} from './real-model-catalog';

type Props = { design: StudioDesign; captureRef: React.RefObject<(() => void) | null>; view: number; focus: boolean };
export default function AvatarScene({ design, captureRef, view, focus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const rebuild = useRef<((d: StudioDesign) => void) | null>(null);
  const resetView = useRef<((focus:boolean) => void) | null>(null);
  const [error, setError] = useState(false);
  const [modelStatus,setModelStatus]=useState('');
  const [motionState,setMotionState]=useState('');
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor('#eaece4');
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '반려동물과 방 3D 미리보기. 드래그로 회전하고 스크롤로 확대하세요.');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.minDistance = 2.5; controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI / 2.12; controls.minPolarAngle = 0.2;
    controls.target.set(0, 1, 0);
    const home = (focus = true) => { if (focus) { camera.position.set(3.15, 2.3, 5.6); controls.target.set(.25, .98, .5); } else { camera.position.set(6.5, 4.7, 7.7); controls.target.set(0, .8, 0); } controls.update(); };
    home(); resetView.current = home;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .55; room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xf7f5f0, 0x9b9b8b, .8));
    const fill = new THREE.DirectionalLight(0xdde9ff, 1); fill.position.set(-3, 3, 5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff1d9, 1.8); rim.position.set(-2, 4, -3); scene.add(rim);
    const sun = new THREE.DirectionalLight(0xfff1e3, 3.2); sun.position.set(3, 8, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7; sun.shadow.normalBias = .018; sun.shadow.radius = 3; sun.shadow.blurSamples = 16; scene.add(sun);
    let world = new THREE.Group(); scene.add(world);
    const dispose = (group: THREE.Group) => group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => { const textures=new Set<THREE.Texture>(); for(const value of Object.values(m)) if(value instanceof THREE.Texture) textures.add(value); textures.forEach(texture=>texture.dispose()); m.dispose(); }); } });
    let generation=0,livePet:LivePet|undefined,lastMotion='',activeCredit='';
    rebuild.current = d => {
      const version=++generation;
      activeCredit=realModelFor(d.breedId,d.species).source?.credit??'';
      livePet?.motion?.dispose();livePet=undefined;
      lastMotion='';setMotionState('');
      scene.remove(world); dispose(world); world = new THREE.Group(); scene.add(world);
      const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .78 });
      const mesh = (g: THREE.BufferGeometry, color: string, p: number[], parent: THREE.Group = world) => {
        const obj = new THREE.Mesh(g, material(color)); obj.position.set(p[0], p[1], p[2]); obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
      };
      const box = (size: number[], color: string, p: number[], parent = world) => mesh(new THREE.BoxGeometry(...size as [number, number, number]), color, p, parent);
      const ball = (size: number[], color: string, p: number[], parent = world) => { const obj = mesh(new THREE.SphereGeometry(1, 32, 24), color, p, parent); obj.scale.set(size[0], size[1], size[2]); return obj; };
      const cylinder = (r: number, h: number, color: string, p: number[], parent = world) => mesh(new THREE.CylinderGeometry(r, r, h, 40), color, p, parent);
      box([6.4, .22, 6.4], d.floor, [0, -.14, 0]);
      box([6.4, 3.5, .13], d.wall, [0, 1.51, -3.15]);
      box([.13, 3.5, 6.4], d.wall, [-3.15, 1.51, 0]);
      box([6.25, .12, .06], '#fff9eb', [0, .05, -3.06]);
      box([.06, .12, 6.25], '#fff9eb', [-3.06, .05, 0]);
      for (let x = -3; x < 3.2; x += .65) box([.012, .005, 6.15], '#b8a080', [x, -.022, 0]);
      box([1.8, 1.8, .1], '#f9f3e5', [-1.3, 2, -3.03]);
      box([1.58, 1.58, .12], '#c9e4e3', [-1.3, 2, -2.96]);
      box([.07, 1.65, .14], '#fff9ef', [-1.3, 2, -2.88]);
      box([1.65, .07, .14], '#fff9ef', [-1.3, 2, -2.88]);
      box([2, .12, .38], '#fff9ef', [-1.3, 1.12, -2.88]);
      box([.85, 1.05, .08], '#fff8e9', [1.4, 2.1, -3.02]);
      ball([.24, .27, .035], '#a5b796', [1.4, 2.15, -2.95]);
      ball([.11, .13, .04], '#d6ad7e', [1.18, 2.38, -2.94]);
      if (d.rug) { const rug = cylinder(1.85, .035, d.rugColor, [.35, .005, .45]); rug.scale.z = .82; }
      {setModelStatus('4K 동물 모델을 불러오고 있어요…');buildRealPet(d).then(pet=>{const loaded=pet as LivePet;if(version!==generation){loaded.motion?.dispose();dispose(pet);return;}livePet=loaded;world.add(pet);setModelStatus('');}).catch(()=>{if(version===generation)setModelStatus('모델을 불러오지 못했어요. 페이지를 새로고침해주세요.');});}
      for (const f of d.furniture) {
        const g = new THREE.Group(); g.position.set(f.x, 0, f.z); g.rotation.y = f.rotation * Math.PI / 180; world.add(g);
        if (f.type === 'bed') { const bed = cylinder(.75, .16, f.color, [0, .09, 0], g); bed.scale.z = .8; const cushion = cylinder(.61, .18, '#f6e8cf', [0, .2, 0], g); cushion.scale.z = .8; const pillow = ball([.55, .18, .19], f.color, [0, .29, -.38], g); pillow.rotation.x = -.3; }
        if (f.type === 'sofa') { box([1.9, .4, .85], f.color, [0, .47, 0], g); box([1.9, .75, .2], f.color, [0, .85, -.4], g); for (const x of [-.88, .88]) { box([.24, .6, 1], f.color, [x, .66, 0], g); for (const z of [-.3, .3]) cylinder(.055, .3, '#a6835e', [x, .15, z], g); } box([.62, .12, .63], '#eae5d5', [-.43, .72, .02], g); box([.62, .12, .63], '#eae5d5', [.34, .72, .02], g); }
        if (f.type === 'plant') { mesh(new THREE.CylinderGeometry(.28, .2, .48, 32), f.color, [0, .24, 0], g); cylinder(.04, 1, '#7e8460', [0, .9, 0], g); for (let i = 0; i < 7; i++) { const a = i * 2.4; const leaf = ball([.18, .4, .08], i % 2 ? '#729474' : '#93ac81', [Math.sin(a) * .23, .8 + i * .11, Math.cos(a) * .2], g); leaf.rotation.z = Math.sin(a) * .75; leaf.rotation.y = a; } }
        if (f.type === 'bowl') { cylinder(.28, .13, f.color, [0, .1, 0], g); cylinder(.22, .015, '#b7dce1', [0, .174, 0], g); }
      }
    };
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let lastFrame=performance.now();
    renderer.setAnimationLoop(() => {const now=performance.now(),delta=(now-lastFrame)/1000;lastFrame=now;if(!document.hidden)livePet?.motion?.update(delta);const state=livePet?.motion?.state??'';if(state!==lastMotion){lastMotion=state;setMotionState(state);}controls.update();renderer.render(scene, camera);});
    captureRef.current = () => { renderer.render(scene, camera); const output=document.createElement('canvas');output.width=renderer.domElement.width;output.height=renderer.domElement.height;const ctx=output.getContext('2d')!;ctx.drawImage(renderer.domElement,0,0);if(activeCredit){const size=Math.max(12,output.width/80);ctx.fillStyle='#fffffff0';ctx.fillRect(0,output.height-size*3,output.width,size*3);ctx.fillStyle='#334b39';ctx.font=`${size}px sans-serif`;ctx.fillText(`3D model: ${activeCredit}`,size,output.height-size*1.55,output.width-size*2);ctx.fillText('Modified: custom rig, animation and clothing · creativecommons.org/licenses/by/4.0/',size,output.height-size*.4,output.width-size*2);}output.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.download = '나의-펫-스튜디오.png'; a.href = url; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }, 'image/png'); };
    return () => { generation++; livePet?.motion?.dispose(); observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); dispose(world); environment.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); rebuild.current = null; resetView.current = null; captureRef.current = null; };
  }, [captureRef]);
  useEffect(() => { rebuild.current?.(design); }, [design]);
  useEffect(() => { resetView.current?.(focus); }, [view, focus]);
  return <div className="avatar-canvas" ref={host} data-motion={motionState}>{motionState&&<span className="studio-motion-status">{({idle:'주위를 살펴봐요',walk:'방을 둘러봐요',sitDown:'앉는 중이에요',sitIdle:'앉아서 쉬어요',standUp:'다시 일어나요',lieDown:'편하게 엎드려요',lieIdle:'엎드려 쉬어요',getUp:'다시 일어나요'} as Record<string,string>)[motionState]}</span>}{modelStatus && <div className="studio-model-status" role="status">{modelStatus}</div>}{error && <div className="avatar-webgl-error" role="alert">3D 화면을 열지 못했어요. 브라우저의 하드웨어 가속을 켜거나 다른 브라우저에서 열어주세요.</div>}</div>;
}
