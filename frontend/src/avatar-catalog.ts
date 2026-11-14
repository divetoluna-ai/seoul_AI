export type Species = 'dog' | 'cat';
export type Breed = { id: string; name: string; species: Species; aliases: string[]; fur: string; accent: string; ears: 'floppy' | 'pointed' | 'folded' | 'round'; coat: 'smooth' | 'fluffy' | 'curly'; pattern: 'solid' | 'mask' | 'saddle' | 'points' | 'tabby' | 'tuxedo'; leg: number; length: number; muzzle: number; head: number; tail: 'straight' | 'curl' | 'fluffy' };
const dog: Breed = { id:'mix-dog', name:'믹스견',species:'dog',aliases:['믹스','mix','mixed','혼종'],fur:'#d7ad79',accent:'#fff0dc',ears:'floppy',coat:'smooth',pattern:'solid',leg:1,length:1,muzzle:1,head:1,tail:'straight' };
const cat: Breed = {...dog,id:'mix-cat',name:'믹스묘',species:'cat',aliases:['믹스','mix','mixed','혼종'],fur:'#a9a7a3',ears:'pointed',leg:1.08,muzzle:.65,head:.95,tail:'straight'};
const b = (id:string,name:string,aliases:string[],p:Partial<Breed> = {}): Breed => ({...dog,id,name,aliases,...p});
const c = (id:string,name:string,aliases:string[],p:Partial<Breed> = {}): Breed => ({...cat,id,name,aliases,...p});
export const BREEDS: Breed[] = [dog,
 b('maltese','말티즈',['maltese','몰티즈'],{fur:'#f3eee3',ears:'floppy',coat:'fluffy',leg:.8,muzzle:.65}),
 b('poodle','푸들',['poodle','토이푸들','미니어처푸들','스탠다드푸들'],{fur:'#b98761',coat:'curly',leg:1.22,muzzle:1.1}),
 b('maltipoo','말티푸',['maltipoo'],{fur:'#d2b18a',coat:'curly',leg:.95,muzzle:.7}),
 b('bichon','비숑 프리제',['비숑','bichon','bichonfrise'],{fur:'#f5f1e7',coat:'curly',head:1.2,muzzle:.6,leg:.85,ears:'round'}),
 b('pomeranian','포메라니안',['포메','pomeranian'],{fur:'#d8a567',coat:'fluffy',ears:'pointed',head:1.05,leg:.75,tail:'fluffy',muzzle:.8}),
 b('shiba','시바 이누',['시바','시바견','shiba','shibainu'],{fur:'#c99557',ears:'pointed',pattern:'mask',tail:'curl',leg:1.1}),
 b('corgi','웰시 코기',['코기','웰시코기','corgi','welshcorgi'],{fur:'#c79860',ears:'pointed',pattern:'mask',leg:.55,length:1.3,muzzle:1.1}),
 b('retriever','골든 리트리버',['골든리트리버','리트리버','goldenretriever'],{fur:'#d6b27a',coat:'fluffy',leg:1.2,length:1.15,muzzle:1.15,tail:'fluffy'}),
 b('labrador','래브라도 리트리버',['라브라도','래브라도','labrador','labradorretriever'],{fur:'#d4c09a',leg:1.2,length:1.1,muzzle:1.1}),
 b('husky','시베리안 허스키',['허스키','husky','siberianhusky'],{fur:'#626771',accent:'#f5f0e6',ears:'pointed',pattern:'mask',leg:1.2,tail:'fluffy'}),
 b('samoyed','사모예드',['samoyed'],{fur:'#f0eee5',ears:'pointed',coat:'fluffy',leg:1.2,tail:'fluffy'}),
 b('jindo','진돗개',['진도','jindo','진도개'],{fur:'#e3cda5',ears:'pointed',leg:1.25,muzzle:1.1,tail:'curl'}),
 b('dachshund','닥스훈트',['dachshund'],{fur:'#805038',accent:'#bd905f',leg:.5,length:1.55,muzzle:1.3,ears:'floppy'}),
 b('chihuahua','치와와',['chihuahua'],{fur:'#c5a178',leg:.85,head:1.15,muzzle:.55,ears:'pointed'}),
 b('french-bulldog','프렌치 불도그',['프렌치불독','프렌치불도그','불독','frenchbulldog'],{fur:'#b7a48e',accent:'#655546',pattern:'points',head:1.15,muzzle:.25,ears:'round',leg:.75}),
 b('beagle','비글',['beagle'],{fur:'#bd8b56',accent:'#f3e8d6',pattern:'saddle',leg:1.05,muzzle:1.1}),
 b('border-collie','보더 콜리',['보더콜리','bordercollie'],{fur:'#3f4245',accent:'#f4eee3',pattern:'tuxedo',coat:'fluffy',ears:'pointed',leg:1.2,length:1.1}),
 b('shih-tzu','시추',['시츄','shihtzu'],{fur:'#d2c2aa',accent:'#f5eee3',pattern:'mask',coat:'fluffy',leg:.7,muzzle:.25}),
 b('yorkshire','요크셔 테리어',['요크셔','요키','yorkshireterrier','yorkie'],{fur:'#777980',accent:'#be986d',pattern:'points',coat:'fluffy',leg:.85,ears:'pointed'}),
 b('schnauzer','슈나우저',['schnauzer'],{fur:'#777b7d',accent:'#d6d7d2',pattern:'points',muzzle:1.1,leg:1.1,ears:'folded'}),
 b('pug','퍼그',['pug'],{fur:'#d8c29c',accent:'#574d44',pattern:'points',head:1.12,muzzle:.2,leg:.7,ears:'folded',tail:'curl'}),
 cat,
 c('korean-shorthair','코리안 쇼트헤어',['코숏','코리안숏헤어','코리안쇼트헤어','koreanshorthair','고등어'],{fur:'#9b9284',accent:'#514b45',pattern:'tabby'}),
 c('cheese','치즈 태비',['치즈','치즈냥','치즈태비','orangetabby'],{fur:'#d7a366',accent:'#a77343',pattern:'tabby'}),
 c('tuxedo','턱시도',['턱시도고양이','tuxedo'],{fur:'#414344',accent:'#f4eee3',pattern:'tuxedo'}),
 c('siamese','샴',['샴고양이','siamese'],{fur:'#e1d4bf',accent:'#665448',pattern:'points',muzzle:.75,leg:1.2}),
 c('ragdoll','랙돌',['ragdoll','렉돌'],{fur:'#ece4d6',accent:'#8b7d72',pattern:'mask',coat:'fluffy',head:1.05,length:1.15,tail:'fluffy'}),
 c('persian','페르시안',['persian'],{fur:'#eee8dc',coat:'fluffy',head:1.15,muzzle:.2,leg:.85,tail:'fluffy'}),
 c('scottish-fold','스코티시 폴드',['스코티쉬폴드','스코티시폴드','폴드','scottishfold'],{fur:'#b1b0ab',ears:'folded',head:1.12,muzzle:.5,leg:.9}),
 c('british-shorthair','브리티시 쇼트헤어',['브리티쉬숏헤어','브리티시숏헤어','브리티쉬쇼트헤어','britishshorthair','브숏'],{fur:'#929ba6',head:1.15,muzzle:.5,leg:.85}),
 c('russian-blue','러시안 블루',['러시안블루','russianblue'],{fur:'#7f919f',head:.9,muzzle:.7,leg:1.2}),
 c('maine-coon','메인쿤',['메인쿤고양이','mainecoon'],{fur:'#9b8b74',accent:'#5b5146',pattern:'tabby',coat:'fluffy',leg:1.25,length:1.2,head:1.1,tail:'fluffy'}),
 c('bengal','벵갈',['뱅갈','bengal'],{fur:'#bb9861',accent:'#614c36',pattern:'tabby',leg:1.2,length:1.1}),
 c('sphynx','스핑크스',['sphynx','sphinx'],{fur:'#c6a6a2',head:.9,muzzle:.7,leg:1.2}),
 c('american-shorthair','아메리칸 쇼트헤어',['아메리칸숏헤어','아메숏','americanshorthair'],{fur:'#bfc0bc',accent:'#62666a',pattern:'tabby',head:1.05}),
 c('norwegian','노르웨이 숲',['노르웨이숲','노르웨이숲고양이','norwegianforestcat'],{fur:'#a3947f',accent:'#f4eee3',pattern:'tuxedo',coat:'fluffy',length:1.15,leg:1.2,tail:'fluffy'})
];
const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_·]/g,'');
export function findBreed(input: string, species: Species): Breed | undefined {
 const value = normalize(input.trim());
 return BREEDS.find(b => b.species === species && [b.id,b.name,...b.aliases].some(alias => normalize(alias) === value));
}
export function breedById(id: string, species: Species): Breed { return BREEDS.find(b => b.id === id && b.species === species) || (species === 'dog' ? dog : cat); }
export type Outfit = { id: string; name: string; style: 'tank'|'sweat'|'shirring'|'stripe'|'turtle'|'mona'|'ribbon'|'ring'; color: string; trim: string; url: string; image: string };
export const OUTFITS: Outfit[] = [
 {id:'monet-navy',name:'피그먼트 모네 나시(네이비)',style:'tank',color:'#444b63',trim:'#34394d',product:50},
 {id:'monet-cream',name:'피그먼트 모네 나시(크림)',style:'tank',color:'#e5d9b9',trim:'#bca883',product:48},
 {id:'crop-black',name:'어도러블 크롭 맨투맨(블랙)',style:'sweat',color:'#343335',trim:'#ddd9ce',product:52},
 {id:'crop-gray',name:'어도러블 크롭 맨투맨(그레이)',style:'sweat',color:'#b6b4b4',trim:'#616064',product:53},
 {id:'shirring-coral',name:'셔링 숄더 골지티(코랄)',style:'shirring',color:'#d98583',trim:'#e9aaa2',product:12},
 {id:'stripe-pink',name:'스트라이프 리본 나시 탑(핑크)',style:'stripe',color:'#f3e4db',trim:'#dc7d8f',product:19},
 {id:'turtle-brown',name:'피치 기모 터틀넥(브라운)',style:'turtle',color:'#896950',trim:'#775b46',product:30},
 {id:'mona',name:'모나 슬리브리스',style:'mona',color:'#eee2ed',trim:'#343643',product:63},
 {id:'stitch-ribbon',name:'스티치 리본 스웻맨투맨',style:'ribbon',color:'#9ccce3',trim:'#f3eee8',product:71},
 {id:'stitch-ring',name:'스티치 링링 탑',style:'ring',color:'#ede2d6',trim:'#785b4a',product:70}
].map(({product,...outfit}) => ({...outfit, style:outfit.style as Outfit['style'],url:`https://adorable-dog.com/product/detail.html?product_no=${product}`,image:`/images/wardrobe/${product}.jpg`}));
