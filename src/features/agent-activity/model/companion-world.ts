export type WorldPoint={x:number;y:number};
export type WorldInteraction='study'|'skills'|'rest'|'inventory'|'growth';
export const WORLD_WIDTH=1000;
export const WORLD_HEIGHT=2000/3;
export const WORLD_SPOTS:ReadonlyArray<{id:WorldInteraction;point:WorldPoint;anchor:WorldPoint}>=[
 {id:'study',point:{x:820,y:480},anchor:{x:845,y:370}},
 {id:'skills',point:{x:630,y:350},anchor:{x:640,y:270}},
 {id:'rest',point:{x:200,y:465},anchor:{x:170,y:380}},
 {id:'inventory',point:{x:190,y:560},anchor:{x:110,y:550}},
 {id:'growth',point:{x:500,y:535},anchor:{x:505,y:360}},
];
const obstacles=[{left:40,right:285,top:275,bottom:435},{left:740,right:980,top:230,bottom:450},{left:35,right:155,top:505,bottom:630}];
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function worldWalkable(point:WorldPoint,field=false):boolean{
 return point.x>=55&&point.x<=945&&point.y>=(field?410:342)&&point.y<=600&&(field||!obstacles.some(r=>point.x>r.left-8&&point.x<r.right+8&&point.y>r.top-8&&point.y<r.bottom+8));
}
export function moveInWorld(point:WorldPoint,dx:number,dy:number,field=false):WorldPoint{
 const x=clamp(point.x+dx,55,945),y=clamp(point.y+dy,field?410:342,600);
 const next={...point};if(worldWalkable({x,y:next.y},field))next.x=x;if(worldWalkable({x:next.x,y},field))next.y=y;return next;
}
export function nearbyWorldSpot(point:WorldPoint):WorldInteraction|null{
 const nearest=WORLD_SPOTS.map(spot=>({id:spot.id,distance:Math.hypot(spot.point.x-point.x,spot.point.y-point.y)})).sort((a,b)=>a.distance-b.distance)[0];return nearest&&nearest.distance<=100?nearest.id:null;
}
