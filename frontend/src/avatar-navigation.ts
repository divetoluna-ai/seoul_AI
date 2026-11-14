export type Point = { x: number; z: number };
export type Obstacle = Point & { radius: number };
export function roomRoute(start: Point, goal: Point, radius: number, obstacles: Obstacle[]): Point[] {
 const step = .25, limit = 3 - radius;
 const free = (p: Point) => Math.abs(p.x) <= limit && Math.abs(p.z) <= limit && obstacles.every(o => Math.hypot(p.x-o.x,p.z-o.z) > radius+o.radius+.08);
 const clear = (a: Point,b: Point) => {
  const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.04);
  for(let i=0;i<=n;i++) {const t=n?i/n:0;if(!free({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;}return true;
 };
 if(!free(start)||!free(goal))return [];
 if(clear(start,goal))return [goal];
 const key=(p:Point)=>`${Math.round(p.x/step)},${Math.round(p.z/step)}`;
 const snap=(p:Point)=>({x:Math.round(p.x/step)*step,z:Math.round(p.z/step)*step});
 const first=snap(start),last=snap(goal);if(!clear(start,first)||!clear(last,goal))return [];
 const queue=[first],seen=new Map<string,Point|null>([[key(first),null]]);
 for(let i=0;i<queue.length&&i<2500;i++) {
  const p=queue[i];
  if(key(p)===key(last)) {
   const path:Point[]=[goal];let cursor:Point|null=p;
   while(cursor){path.unshift(cursor);cursor=seen.get(key(cursor))??null;}return path;
  }
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
   const next={x:p.x+dx*step,z:p.z+dz*step},id=key(next);
   if(!seen.has(id)&&clear(p,next)){seen.set(id,p);queue.push(next);}
  }
 }
 return [];
}
