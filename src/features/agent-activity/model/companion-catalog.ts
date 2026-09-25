/** Fictional game content. These IDs are never ontology UIDs or project evidence. */
export type LocalizedName={en:string;ko:string};
export const localName=(name:LocalizedName,locale:string)=>locale==='ko'?name.ko:name.en;
const MONSTER_TRAITS=['armored','fierce','mender','siphon','swarm','arcane'] as const;
type MonsterTrait=typeof MONSTER_TRAITS[number];
const MAP_EFFECTS=['calm','bounty','vital','fortified','insight','elite'] as const;
type MapEffect=typeof MAP_EFFECTS[number];
const content=[
 {
  "id": "grove",
  "name": {
   "en": "Archive Grove",
   "ko": "기록의 숲"
  },
  "knowledge": 5,
  "maps": [
   {
    "en": "Fern Gate",
    "ko": "고사리 문"
   },
   {
    "en": "Luminous Glade",
    "ko": "빛버섯 공터"
   },
   {
    "en": "Fallen Oak",
    "ko": "쓰러진 떡갈나무"
   },
   {
    "en": "Ivy Archive",
    "ko": "담쟁이 기록원"
   },
   {
    "en": "Firefly Garden",
    "ko": "반딧불 정원"
   },
   {
    "en": "Hollow Sanctuary",
    "ko": "고목의 성소"
   }
  ],
  "creatures": [
   {
    "en": "Acorn slime",
    "ko": "도토리 젤리"
   },
   {
    "en": "Inkcap stalker",
    "ko": "먹물갓 추적자"
   },
   {
    "en": "Fern shelled beetle",
    "ko": "고사리 딱정벌레"
   },
   {
    "en": "Twig rabbit",
    "ko": "잔가지 토끼"
   },
   {
    "en": "Scroll wing moth",
    "ko": "두루마리 나방"
   },
   {
    "en": "Mossback snail",
    "ko": "이끼 달팽이"
   },
   {
    "en": "Pinecone crab",
    "ko": "솔방울 게"
   },
   {
    "en": "Amber seedling",
    "ko": "호박 씨앗"
   },
   {
    "en": "Root puppet",
    "ko": "뿌리 인형"
   },
   {
    "en": "Leaf mantis",
    "ko": "잎사귀 사마귀"
   },
   {
    "en": "Dew frog",
    "ko": "이슬 개구리"
   },
   {
    "en": "Hollow log owl",
    "ko": "통나무 올빼미"
   },
   {
    "en": "Lichen tortoise",
    "ko": "지의류 거북"
   },
   {
    "en": "Briar hedgehog",
    "ko": "가시 고슴도치"
   },
   {
    "en": "Sap lantern wisp",
    "ko": "수액 등불"
   },
   {
    "en": "Enormous antlered oak",
    "ko": "떡갈나무 파수꾼"
   },
   {
    "en": "Ancient scrollback stag",
    "ko": "두루마리 사슴"
   },
   {
    "en": "Blossoming stump giant",
    "ko": "꽃그루터기 거인"
   }
  ]
 },
 {
  "id": "foundry",
  "name": {
   "en": "Clockglass Foundry",
   "ko": "시계유리 공방"
  },
  "knowledge": 200,
  "maps": [
   {
    "en": "Brass Terminus",
    "ko": "황동 종착역"
   },
   {
    "en": "Glassblower Yard",
    "ko": "유리장이 마당"
   },
   {
    "en": "Gear Hall",
    "ko": "톱니의 전당"
   },
   {
    "en": "Steam Canal",
    "ko": "증기 운하"
   },
   {
    "en": "Magnetic Chamber",
    "ko": "자기장 방"
   },
   {
    "en": "Bell Cathedral",
    "ko": "종의 대성당"
   }
  ],
  "creatures": [
   {
    "en": "Copper screw grub",
    "ko": "구리나사 애벌레"
   },
   {
    "en": "Windup beetle",
    "ko": "태엽 딱정벌레"
   },
   {
    "en": "Glass orb drone",
    "ko": "유리구슬 드론"
   },
   {
    "en": "Spring coil hare",
    "ko": "용수철 토끼"
   },
   {
    "en": "Gear shelled crab",
    "ko": "톱니 게"
   },
   {
    "en": "Tiny furnace imp",
    "ko": "화로 꼬마"
   },
   {
    "en": "Magnet slug",
    "ko": "자석 민달팽이"
   },
   {
    "en": "Clock face owl",
    "ko": "시계 올빼미"
   },
   {
    "en": "Rivet porcupine",
    "ko": "리벳 고슴도치"
   },
   {
    "en": "Wire moth",
    "ko": "전선 나방"
   },
   {
    "en": "Glass chime jelly",
    "ko": "유리종 해파리"
   },
   {
    "en": "Cogwheel turtle",
    "ko": "톱니바퀴 거북"
   },
   {
    "en": "Steam kettle toad",
    "ko": "주전자 두꺼비"
   },
   {
    "en": "Bronze key bat",
    "ko": "청동열쇠 박쥐"
   },
   {
    "en": "Armored piston hound",
    "ko": "피스톤 사냥개"
   },
   {
    "en": "Giant clockwork beetle",
    "ko": "대태엽 장수풍뎅이"
   },
   {
    "en": "Towering glass bell sentinel",
    "ko": "유리종 파수꾼"
   },
   {
    "en": "Massive brass ram",
    "ko": "황동 산양"
   }
  ]
 },
 {
  "id": "marsh",
  "name": {
   "en": "Inkwell Marsh",
   "ko": "잉크 늪지"
  },
  "knowledge": 500,
  "maps": [
   {
    "en": "Reed Crossing",
    "ko": "갈대 나루"
   },
   {
    "en": "Inkwell Pools",
    "ko": "잉크 연못"
   },
   {
    "en": "Paperboat Landing",
    "ko": "종이배 선착장"
   },
   {
    "en": "Quill Grove",
    "ko": "깃펜 수풀"
   },
   {
    "en": "Sunken Library",
    "ko": "잠긴 도서관"
   },
   {
    "en": "Reed Shrine",
    "ko": "갈대 사원"
   }
  ],
  "creatures": [
   {
    "en": "Inkdrop blob",
    "ko": "잉크방울"
   },
   {
    "en": "Quill feather imp",
    "ko": "깃펜 꼬마"
   },
   {
    "en": "Reed crab",
    "ko": "갈대 게"
   },
   {
    "en": "Violet marsh frog",
    "ko": "보랏빛 개구리"
   },
   {
    "en": "Paper boat snail",
    "ko": "종이배 달팽이"
   },
   {
    "en": "Fountain pen mosquito",
    "ko": "만년필 모기"
   },
   {
    "en": "Ribbon eel",
    "ko": "리본 장어"
   },
   {
    "en": "Inky lantern fish on legs",
    "ko": "등불 아귀"
   },
   {
    "en": "Wax seal spider",
    "ko": "봉인 거미"
   },
   {
    "en": "Blot butterfly",
    "ko": "얼룩 나비"
   },
   {
    "en": "Reed woven puppet",
    "ko": "갈대 인형"
   },
   {
    "en": "Black pearl clam",
    "ko": "흑진주 조개"
   },
   {
    "en": "Mushroom umbrella imp",
    "ko": "우산버섯 요정"
   },
   {
    "en": "Folded paper heron",
    "ko": "종이 왜가리"
   },
   {
    "en": "Ripple salamander",
    "ko": "물결 도롱뇽"
   },
   {
    "en": "Giant crowned inkwell toad",
    "ko": "왕관 잉크두꺼비"
   },
   {
    "en": "Many tailed quill serpent",
    "ko": "깃펜 큰뱀"
   },
   {
    "en": "Massive reed shrine turtle",
    "ko": "갈대사원 거북"
   }
  ]
 },
 {
  "id": "frost",
  "name": {
   "en": "Frost Observatory",
   "ko": "서리 천문대"
  },
  "knowledge": 1000,
  "maps": [
   {
    "en": "Aurora Trail",
    "ko": "오로라 오솔길"
   },
   {
    "en": "Frozen Falls",
    "ko": "얼어붙은 폭포"
   },
   {
    "en": "Crystal Shelf",
    "ko": "수정 빙붕"
   },
   {
    "en": "Rime Observatory",
    "ko": "서리 관측소"
   },
   {
    "en": "Telescope Terrace",
    "ko": "망원경 테라스"
   },
   {
    "en": "Aurora Sanctuary",
    "ko": "오로라 성소"
   }
  ],
  "creatures": [
   {
    "en": "Snow puff slime",
    "ko": "눈송이 젤리"
   },
   {
    "en": "Crystal horn hare",
    "ko": "수정뿔 토끼"
   },
   {
    "en": "Icicle beetle",
    "ko": "고드름 딱정벌레"
   },
   {
    "en": "Woolly telescope moth",
    "ko": "망원경 나방"
   },
   {
    "en": "Frost feather owl",
    "ko": "서리 올빼미"
   },
   {
    "en": "Snowglobe snail",
    "ko": "눈구슬 달팽이"
   },
   {
    "en": "Ice shard crab",
    "ko": "얼음조각 게"
   },
   {
    "en": "Blue comet gecko",
    "ko": "혜성 도마뱀"
   },
   {
    "en": "Rime pinecone imp",
    "ko": "서리솔방울 꼬마"
   },
   {
    "en": "Tiny polar star sprite",
    "ko": "북극별 요정"
   },
   {
    "en": "Glassflake jelly",
    "ko": "유리눈꽃 해파리"
   },
   {
    "en": "Winter lantern stoat",
    "ko": "겨울등불 족제비"
   },
   {
    "en": "Frostwing bat",
    "ko": "서리날개 박쥐"
   },
   {
    "en": "Silver compass beetle",
    "ko": "은나침반 벌레"
   },
   {
    "en": "Aurora feather serpent",
    "ko": "오로라 뱀"
   },
   {
    "en": "Great snow antler",
    "ko": "설원 뿔사슴"
   },
   {
    "en": "Massive crystal telescope golem",
    "ko": "수정망원경 골렘"
   },
   {
    "en": "Ancient aurora owl",
    "ko": "고대 오로라 올빼미"
   }
  ]
 },
 {
  "id": "ember",
  "name": {
   "en": "Ember Quarry",
   "ko": "잿불 채석장"
  },
  "knowledge": 1800,
  "maps": [
   {
    "en": "Coal Terrace",
    "ko": "석탄 단구"
   },
   {
    "en": "Ruby Cavern",
    "ko": "홍옥 동굴"
   },
   {
    "en": "Anvil Yard",
    "ko": "모루 마당"
   },
   {
    "en": "Magma Bridge",
    "ko": "마그마 다리"
   },
   {
    "en": "Copper Forge",
    "ko": "구리 대장간"
   },
   {
    "en": "Ember Throne",
    "ko": "잿불 왕좌"
   }
  ],
  "creatures": [
   {
    "en": "Ember coal blob",
    "ko": "불씨 젤리"
   },
   {
    "en": "Obsidian beetle",
    "ko": "흑요석 딱정벌레"
   },
   {
    "en": "Cinder mouse",
    "ko": "잿불 생쥐"
   },
   {
    "en": "Ruby crystal crab",
    "ko": "홍옥 게"
   },
   {
    "en": "Smoke salamander",
    "ko": "연기 도롱뇽"
   },
   {
    "en": "Tiny anvil imp",
    "ko": "모루 꼬마"
   },
   {
    "en": "Lava shell snail",
    "ko": "용암 달팽이"
   },
   {
    "en": "Copper pickaxe mantis",
    "ko": "곡괭이 사마귀"
   },
   {
    "en": "Ash wing moth",
    "ko": "재날개 나방"
   },
   {
    "en": "Smoldering pinecone imp",
    "ko": "타는 솔방울"
   },
   {
    "en": "Ore horn tortoise",
    "ko": "광석뿔 거북"
   },
   {
    "en": "Charcoal soot owl",
    "ko": "숯 올빼미"
   },
   {
    "en": "Glowing geode hedgehog",
    "ko": "정동 고슴도치"
   },
   {
    "en": "Bellows lizard",
    "ko": "풀무 도마뱀"
   },
   {
    "en": "Magma lily sprite",
    "ko": "마그마꽃 요정"
   },
   {
    "en": "Great obsidian ram",
    "ko": "흑요석 산양"
   },
   {
    "en": "Giant molten forge tortoise",
    "ko": "용광로 거북"
   },
   {
    "en": "Massive ember crown golem",
    "ko": "불꽃왕관 골렘"
   }
  ]
 },
 {
  "id": "astral",
  "name": {
   "en": "Astral Archive",
   "ko": "별빛 서고"
  },
  "knowledge": 3000,
  "maps": [
   {
    "en": "Archive Landing",
    "ko": "서고 착륙장"
   },
   {
    "en": "Constellation Garden",
    "ko": "별자리 정원"
   },
   {
    "en": "Meteor Library",
    "ko": "운석 도서관"
   },
   {
    "en": "Orbital Terrace",
    "ko": "궤도 테라스"
   },
   {
    "en": "Crescent Bridge",
    "ko": "초승달 다리"
   },
   {
    "en": "Starwheel Sanctuary",
    "ko": "별바퀴 성소"
   }
  ],
  "creatures": [
   {
    "en": "Tiny star jelly",
    "ko": "별 해파리"
   },
   {
    "en": "Crescent shelled snail",
    "ko": "초승달 달팽이"
   },
   {
    "en": "Orbit ring beetle",
    "ko": "궤도 딱정벌레"
   },
   {
    "en": "Paper constellation bird",
    "ko": "종이별 새"
   },
   {
    "en": "Nebula rabbit",
    "ko": "성운 토끼"
   },
   {
    "en": "Floating hourglass imp",
    "ko": "모래시계 꼬마"
   },
   {
    "en": "Meteor crab",
    "ko": "운석 게"
   },
   {
    "en": "Comet tail ferret",
    "ko": "혜성 꼬리담비"
   },
   {
    "en": "Prism moth",
    "ko": "프리즘 나방"
   },
   {
    "en": "Cosmic compass turtle",
    "ko": "우주나침반 거북"
   },
   {
    "en": "Tiny eclipse bat",
    "ko": "일식 박쥐"
   },
   {
    "en": "Stardust quill hedgehog",
    "ko": "별먼지 고슴도치"
   },
   {
    "en": "Ribbon galaxy eel",
    "ko": "은하 리본장어"
   },
   {
    "en": "Crystal eye owl",
    "ko": "수정눈 올빼미"
   },
   {
    "en": "Moon seed sprite",
    "ko": "달씨앗 요정"
   },
   {
    "en": "Great celestial archive dragon",
    "ko": "천상서고 용"
   },
   {
    "en": "Massive ringed planet golem",
    "ko": "고리행성 골렘"
   },
   {
    "en": "Ancient star crowned sphinx",
    "ko": "별왕관 스핑크스"
   }
  ]
 }
];
export const REGIONS=content.map(({id,name,knowledge},index)=>({id,name,knowledge,index}));
export type Species={id:string;region:string;index:number;name:LocalizedName;guardian:boolean;trait:MonsterTrait;vitality:number;power:number};
export const SPECIES:Species[]=content.flatMap((region,regionIndex)=>region.creatures.map((name,index)=>({
 id:region.id+'-'+String(index+1).padStart(2,'0'),region:region.id,index,name,guardian:index>=15,
 trait:MONSTER_TRAITS[(index+regionIndex)%6],vitality:[.85,1,1.1,1.2,1.3][index%5],power:[.9,1,1.1][Math.floor(index/5)%3],
})));
export type AdventureMap={id:string;region:string;index:number;name:LocalizedName;requiredKnowledge:number;difficulty:number;effect:MapEffect;roster:string[];guardian:string};
export const ADVENTURE_MAPS:AdventureMap[]=content.flatMap((region,regionIndex)=>region.maps.map((name,index)=>({
 id:'adventure:'+region.id+':'+(index+1),region:region.id,index,name,
 requiredKnowledge:region.knowledge+[0,10,25,50,85,120][index],difficulty:regionIndex+Math.floor(index/2),effect:MAP_EFFECTS[index],
 roster:Array.from({length:5},(_,i)=>region.id+'-'+String((index*3+i)%15+1).padStart(2,'0')),
 guardian:region.id+'-'+(16+index%3),
})));
const speciesById=new Map(SPECIES.map(species=>[species.id,species]));
const mapsById=new Map(ADVENTURE_MAPS.map(map=>[map.id,map]));
export const adventureMap=(id:string|null)=>id?mapsById.get(id):undefined;
export const adventureSpecies=(id:string)=>speciesById.get(id);
export function encounterSpecies(area:string|null,encounter:number,seed:number):Species|undefined{
 const map=adventureMap(area);if(!map)return undefined;
 return adventureSpecies(encounter===14?map.guardian:map.roster[(encounter+seed%map.roster.length)%map.roster.length]);
}
export const mapBackground=(map:AdventureMap)=>({file:'/brand/companion-'+map.region+'-maps.webp',position:`${map.index%3*50}% ${Math.floor(map.index/3)*100}%`});
