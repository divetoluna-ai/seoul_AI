import { breedById, type Breed, type Species } from './avatar-catalog.ts';
export type Ellipsoid = { c: [number,number,number]; r: [number,number,number]; blend: number };
export type Anatomy = { breed: Breed; cat: boolean; bodyY: number; bodyWidth: number; bodyHeight: number; bodyLength: number; legHeight: number; legX: number; foreZ: number; headY: number; headZ: number; skull: [number,number,number]; muzzleLength: number; muzzleWidth: number; noseZ: number; eyeX: number; eyeY: number; eyeZ: number; furLength: number; parts: Ellipsoid[]; torso: Ellipsoid[] };
export function anatomyFor(breedId:string, species:Species): Anatomy {
 const breed=breedById(breedId,species),cat=species==='cat';
 const compact=['pomeranian','bichon','pug','french-bulldog','persian','british-shorthair','scottish-fold'].includes(breed.id);
 const legHeight=(cat?.43:.4)*breed.leg;
 const bodyY=legHeight+.4;
 const bodyWidth=(cat?.275:compact?.36:.32)*(breed.id==='french-bulldog'?1.14:1);
 const bodyHeight=cat?.32:compact?.4:.36;
 const bodyLength=(cat?.62:.66)*breed.length;
 const legX=bodyWidth*.68,foreZ=bodyLength*.67;
 const headY=bodyY+(cat?.49:compact?.55:.57),headZ=bodyLength*.8;
 const skull:[number,number,number]=[(cat?.295:compact?.355:.33)*breed.head,(cat?.28:.32)*breed.head,(cat?.265:.305)*breed.head];
 if (breed.id==='pomeranian') { skull[0]=.395; skull[1]=.34; skull[2]=.29; }
 const muzzleLength=breed.id==='pomeranian'?.14:cat?.08+.095*breed.muzzle:.09+.2*breed.muzzle;
 const muzzleWidth=cat?.125:breed.id==='pomeranian'?.17:breed.id==='labrador'||breed.id==='retriever'?.225:.19;
 const noseZ=headZ+skull[2]*.62+muzzleLength*.98;
 const eyeX=skull[0]*(breed.id==='pomeranian'?.45:cat?.59:.54),eyeY=headY+skull[1]*.16;
 const eyeZ=headZ+skull[2]*.79;
 const furLength=breed.id==='sphynx'?0:breed.coat==='fluffy'?(breed.id==='pomeranian'?.075:.065):breed.coat==='curly'?.045:.016;
 const parts:Ellipsoid[]=[];
 const add=(c:Ellipsoid['c'],r:Ellipsoid['r'],blend=.1)=>{const part={c,r,blend};parts.push(part);return part;};
 add([0,bodyY,-bodyLength*.12],[bodyWidth,bodyHeight,bodyLength],.12);
 add([0,bodyY+.025,bodyLength*.5],[bodyWidth*1.02,bodyHeight*1.04,bodyLength*.49],.15);
 add([0,bodyY-.07,-bodyLength*.48],[bodyWidth*.88,bodyHeight*.85,bodyLength*.43],.12);
 add([0,bodyY+.26,headZ*.85],[bodyWidth*.73,.39,.28],.16);
 add([0,headY,headZ],skull,.13);
 add([0,headY-.105,headZ+skull[2]*.54],[muzzleWidth*.85,.14,muzzleLength*.9],.08);
 for(const side of [-1,1])add([side*muzzleWidth*.42,headY-.115,headZ+skull[2]*.62+muzzleLength*.4],[muzzleWidth*.68,cat?.085:.115,muzzleLength*.7],.055);
 add([0,headY-.19,headZ+skull[2]*.53+muzzleLength*.3],[muzzleWidth*.8,.075,muzzleLength*.75],.06);
 const torso=parts.slice(0,4);
 for(const side of [-1,1]) {
  torso.push(add([side*legX,bodyY-.15,foreZ],[.135,bodyHeight*.94,.16],.105));
  add([side*legX,.22+legHeight*.35,foreZ+.015],[cat?.075:.09,legHeight*.6,.09],.07);
  add([side*legX,.115,foreZ+.075],[cat?.112:.127,.115,.17],.045);
  torso.push(add([side*legX,bodyY-.1,-bodyLength*.57],[bodyWidth*.58,.3,.225],.11));
  add([side*legX,.24+legHeight*.27,-bodyLength*.65],[.105,legHeight*.47,.12],.075);
  add([side*legX,.15+legHeight*.14,-bodyLength*.73],[.078,legHeight*.38,.08],.045);
  add([side*legX,.11,-bodyLength*.67],[cat?.112:.127,.11,.16],.04);
 }
 if (breed.coat==='curly') add([0,headY+skull[1]*.43,headZ-.03],[skull[0]*1.02,skull[1]*.81,skull[2]*.96],.13);
 return {breed,cat,bodyY,bodyWidth,bodyHeight,bodyLength,legHeight,legX,foreZ,headY,headZ,skull,muzzleLength,muzzleWidth,noseZ,eyeX,eyeY,eyeZ,furLength,parts,torso};
}
export function fieldAt(parts:Ellipsoid[],x:number,y:number,z:number):number {
 let distance=100;
 for(const p of parts) {
  const dx=(x-p.c[0])/p.r[0],dy=(y-p.c[1])/p.r[1],dz=(z-p.c[2])/p.r[2];
  const k0=Math.sqrt(dx*dx+dy*dy+dz*dz);
  const k1=Math.sqrt((dx/p.r[0])**2+(dy/p.r[1])**2+(dz/p.r[2])**2);
  const next=k1>1e-8?k0*(k0-1)/k1:-Math.min(...p.r);
  const h=Math.max(p.blend-Math.abs(distance-next),0)/p.blend;
  distance=Math.min(distance,next)-h*h*p.blend*.25;
 }
 return distance;
}
