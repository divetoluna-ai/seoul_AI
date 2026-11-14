import type {Species} from './avatar-catalog.ts';
export type RealModel={id:string;species:Species;name:string;detail:string;slug:string;height:number;yaw:number;shiftX:number;guide:[number,number,number][];radii:[number,number];armU:number;armAngle:number};
export const REAL_MODELS:RealModel[]=[
 {id:'mix-dog',species:'dog',name:'믹스견',detail:'성견 · 서 있는 자세',slug:'dog',height:2.05,yaw:-.5,shiftX:-.105,guide:[[0,1.15,-.67],[0,1.23,.12],[0,1.48,.52]],radii:[.31,.34],armU:.76,armAngle:-.85},
 {id:'bernese',species:'dog',name:'버니즈 마운틴 독',detail:'강아지 · 앉은 자세',slug:'puppy',height:1.9,yaw:.55,shiftX:.2,guide:[[0,.56,-.28],[0,.9,.15],[.06,1.2,.55]],radii:[.43,.43],armU:.7,armAngle:-.7},
 {id:'tabby',species:'cat',name:'태비 믹스',detail:'줄무늬 · 서 있는 자세',slug:'cat',height:1.85,yaw:.78,shiftX:.142,guide:[[0,.91,-.52],[0,.94,.04],[0,1.14,.39]],radii:[.32,.3],armU:.76,armAngle:-.9},
 {id:'sphynx',species:'cat',name:'스핑크스',detail:'무모종 · 서 있는 자세',slug:'sphynx-cat',height:1.85,yaw:-.15,shiftX:-.04,guide:[[0,.94,-.63],[0,1.04,.07],[0,1.27,.43]],radii:[.25,.3],armU:.76,armAngle:-.85},
 {id:'calico-kitten',species:'cat',name:'칼리코 믹스 아기 고양이',detail:'삼색 모색 · 앉은 자세',slug:'kitten',height:1.7,yaw:.55,shiftX:.21,guide:[[.05,.45,-.15],[.05,.76,.2],[.1,1.04,.5]],radii:[.33,.33],armU:.7,armAngle:-.75}
];
export function realModelFor(id:string,species:Species):RealModel{return REAL_MODELS.find(m=>m.id===id&&m.species===species)||REAL_MODELS.find(m=>m.species===species)!;}
