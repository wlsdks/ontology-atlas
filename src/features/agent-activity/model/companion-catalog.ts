/** Fictional game content. These IDs are never ontology UIDs or project evidence. */
export type LocalizedName={en:string;ko:string;ja?:string;zh?:string};
export const localName=(name:LocalizedName,locale:string)=>(name as Partial<Record<string,string>>)[locale]??name.en;
const MONSTER_TRAITS=['armored','fierce','mender','siphon','swarm','arcane'] as const;
type MonsterTrait=typeof MONSTER_TRAITS[number];
const MAP_EFFECTS=['calm','bounty','vital','fortified','insight','elite'] as const;
type MapEffect=typeof MAP_EFFECTS[number];
const content=[
 {
  "id": "grove",
  "name": {
   "en": "Archive Grove",
   "ko": "기록의 숲",
   "ja": "記録の森",
   "zh": "档案之林"
  },
  "knowledge": 5,
  "maps": [
   {
    "en": "Fern Gate",
    "ko": "고사리 문",
    "ja": "シダの門",
    "zh": "蕨叶门"
   },
   {
    "en": "Luminous Glade",
    "ko": "빛버섯 공터",
    "ja": "光きのこの広場",
    "zh": "荧菇空地"
   },
   {
    "en": "Fallen Oak",
    "ko": "쓰러진 떡갈나무",
    "ja": "倒れたカシの木",
    "zh": "倒下的橡树"
   },
   {
    "en": "Ivy Archive",
    "ko": "담쟁이 기록원",
    "ja": "ツタの記録院",
    "zh": "常春藤书院"
   },
   {
    "en": "Firefly Garden",
    "ko": "반딧불 정원",
    "ja": "ホタルの庭",
    "zh": "萤火庭园"
   },
   {
    "en": "Hollow Sanctuary",
    "ko": "고목의 성소",
    "ja": "古木の聖所",
    "zh": "古木圣所"
   }
  ],
  "creatures": [
   {
    "en": "Acorn slime",
    "ko": "도토리 젤리",
    "ja": "どんぐりスライム",
    "zh": "橡果史莱姆"
   },
   {
    "en": "Inkcap stalker",
    "ko": "먹물갓 추적자",
    "ja": "墨茸の追跡者",
    "zh": "墨汁菌追踪者"
   },
   {
    "en": "Fern shelled beetle",
    "ko": "고사리 딱정벌레",
    "ja": "シダの甲虫",
    "zh": "蕨壳甲虫"
   },
   {
    "en": "Twig rabbit",
    "ko": "잔가지 토끼",
    "ja": "小枝ウサギ",
    "zh": "细枝兔"
   },
   {
    "en": "Scroll wing moth",
    "ko": "두루마리 나방",
    "ja": "巻物ガ",
    "zh": "卷轴蛾"
   },
   {
    "en": "Mossback snail",
    "ko": "이끼 달팽이",
    "ja": "苔背のカタツムリ",
    "zh": "苔背蜗牛"
   },
   {
    "en": "Pinecone crab",
    "ko": "솔방울 게",
    "ja": "松ぼっくりガニ",
    "zh": "松果蟹"
   },
   {
    "en": "Amber seedling",
    "ko": "호박 씨앗",
    "ja": "琥珀の種",
    "zh": "琥珀幼苗"
   },
   {
    "en": "Root puppet",
    "ko": "뿌리 인형",
    "ja": "根っこ人形",
    "zh": "树根木偶"
   },
   {
    "en": "Leaf mantis",
    "ko": "잎사귀 사마귀",
    "ja": "葉っぱカマキリ",
    "zh": "叶螳螂"
   },
   {
    "en": "Dew frog",
    "ko": "이슬 개구리",
    "ja": "露ガエル",
    "zh": "露珠蛙"
   },
   {
    "en": "Hollow log owl",
    "ko": "통나무 올빼미",
    "ja": "丸太フクロウ",
    "zh": "树洞猫头鹰"
   },
   {
    "en": "Lichen tortoise",
    "ko": "지의류 거북",
    "ja": "地衣ガメ",
    "zh": "地衣龟"
   },
   {
    "en": "Briar hedgehog",
    "ko": "가시 고슴도치",
    "ja": "茨ハリネズミ",
    "zh": "荆棘刺猬"
   },
   {
    "en": "Sap lantern wisp",
    "ko": "수액 등불",
    "ja": "樹液の灯",
    "zh": "树液灯火"
   },
   {
    "en": "Enormous antlered oak",
    "ko": "떡갈나무 파수꾼",
    "ja": "カシの番人",
    "zh": "橡树守卫"
   },
   {
    "en": "Ancient scrollback stag",
    "ko": "두루마리 사슴",
    "ja": "巻物の鹿",
    "zh": "卷轴雄鹿"
   },
   {
    "en": "Blossoming stump giant",
    "ko": "꽃그루터기 거인",
    "ja": "花切り株の巨人",
    "zh": "花桩巨人"
   }
  ]
 },
 {
  "id": "foundry",
  "name": {
   "en": "Clockglass Foundry",
   "ko": "시계유리 공방",
   "ja": "時計ガラス工房",
   "zh": "钟表玻璃工坊"
  },
  "knowledge": 200,
  "maps": [
   {
    "en": "Brass Terminus",
    "ko": "황동 종착역",
    "ja": "真鍮の終着駅",
    "zh": "黄铜终点站"
   },
   {
    "en": "Glassblower Yard",
    "ko": "유리장이 마당",
    "ja": "ガラス職人の庭",
    "zh": "玻璃匠庭院"
   },
   {
    "en": "Gear Hall",
    "ko": "톱니의 전당",
    "ja": "歯車の殿堂",
    "zh": "齿轮殿堂"
   },
   {
    "en": "Steam Canal",
    "ko": "증기 운하",
    "ja": "蒸気運河",
    "zh": "蒸汽运河"
   },
   {
    "en": "Magnetic Chamber",
    "ko": "자기장 방",
    "ja": "磁場の部屋",
    "zh": "磁场室"
   },
   {
    "en": "Bell Cathedral",
    "ko": "종의 대성당",
    "ja": "鐘の大聖堂",
    "zh": "钟之大教堂"
   }
  ],
  "creatures": [
   {
    "en": "Copper screw grub",
    "ko": "구리나사 애벌레",
    "ja": "銅ネジの幼虫",
    "zh": "铜螺丝幼虫"
   },
   {
    "en": "Windup beetle",
    "ko": "태엽 딱정벌레",
    "ja": "ゼンマイカブト",
    "zh": "发条甲虫"
   },
   {
    "en": "Glass orb drone",
    "ko": "유리구슬 드론",
    "ja": "ガラス玉ドローン",
    "zh": "玻璃珠无人机"
   },
   {
    "en": "Spring coil hare",
    "ko": "용수철 토끼",
    "ja": "バネウサギ",
    "zh": "弹簧兔"
   },
   {
    "en": "Gear shelled crab",
    "ko": "톱니 게",
    "ja": "歯車ガニ",
    "zh": "齿轮蟹"
   },
   {
    "en": "Furnace maw",
    "ko": "화로 아귀",
    "ja": "炉のアンコウ",
    "zh": "炉口鮟鱇"
   },
   {
    "en": "Magnet slug",
    "ko": "자석 민달팽이",
    "ja": "磁石ナメクジ",
    "zh": "磁铁蛞蝓"
   },
   {
    "en": "Clock face owl",
    "ko": "시계 올빼미",
    "ja": "時計フクロウ",
    "zh": "时钟猫头鹰"
   },
   {
    "en": "Rivet porcupine",
    "ko": "리벳 고슴도치",
    "ja": "リベットハリネズミ",
    "zh": "铆钉刺猬"
   },
   {
    "en": "Wire moth",
    "ko": "전선 나방",
    "ja": "電線ガ",
    "zh": "电线蛾"
   },
   {
    "en": "Glass chime jelly",
    "ko": "유리종 해파리",
    "ja": "ガラス鐘クラゲ",
    "zh": "玻璃钟水母"
   },
   {
    "en": "Cogwheel turtle",
    "ko": "톱니바퀴 거북",
    "ja": "歯車ガメ",
    "zh": "齿轮龟"
   },
   {
    "en": "Steam kettle toad",
    "ko": "주전자 두꺼비",
    "ja": "やかんヒキガエル",
    "zh": "水壶蟾蜍"
   },
   {
    "en": "Bronze key bat",
    "ko": "청동열쇠 박쥐",
    "ja": "青銅鍵コウモリ",
    "zh": "青铜钥匙蝙蝠"
   },
   {
    "en": "Armored piston hound",
    "ko": "피스톤 사냥개",
    "ja": "ピストン猟犬",
    "zh": "活塞猎犬"
   },
   {
    "en": "Giant clockwork beetle",
    "ko": "대태엽 장수풍뎅이",
    "ja": "大ゼンマイカブト",
    "zh": "大发条独角仙"
   },
   {
    "en": "Towering glass bell sentinel",
    "ko": "유리종 파수꾼",
    "ja": "ガラス鐘の番人",
    "zh": "玻璃钟守卫"
   },
   {
    "en": "Massive brass ram",
    "ko": "황동 산양",
    "ja": "真鍮の山羊",
    "zh": "黄铜山羊"
   }
  ]
 },
 {
  "id": "marsh",
  "name": {
   "en": "Inkwell Marsh",
   "ko": "잉크 늪지",
   "ja": "インクの沼地",
   "zh": "墨水沼泽"
  },
  "knowledge": 500,
  "maps": [
   {
    "en": "Reed Crossing",
    "ko": "갈대 나루",
    "ja": "葦の渡し",
    "zh": "芦苇渡口"
   },
   {
    "en": "Inkwell Pools",
    "ko": "잉크 연못",
    "ja": "インクの池",
    "zh": "墨水池塘"
   },
   {
    "en": "Paperboat Landing",
    "ko": "종이배 선착장",
    "ja": "紙舟の船着場",
    "zh": "纸船码头"
   },
   {
    "en": "Quill Grove",
    "ko": "깃펜 수풀",
    "ja": "羽根ペンの茂み",
    "zh": "羽毛笔丛林"
   },
   {
    "en": "Sunken Library",
    "ko": "잠긴 도서관",
    "ja": "沈んだ図書館",
    "zh": "沉没图书馆"
   },
   {
    "en": "Reed Shrine",
    "ko": "갈대 사원",
    "ja": "葦の社",
    "zh": "芦苇神殿"
   }
  ],
  "creatures": [
   {
    "en": "Inkdrop blob",
    "ko": "잉크방울",
    "ja": "インクの滴",
    "zh": "墨滴"
   },
   {
    "en": "Quill feather imp",
    "ko": "깃펜 꼬마",
    "ja": "羽根ペンの小鬼",
    "zh": "羽毛笔小鬼"
   },
   {
    "en": "Reed crab",
    "ko": "갈대 게",
    "ja": "葦ガニ",
    "zh": "芦苇蟹"
   },
   {
    "en": "Violet marsh frog",
    "ko": "보랏빛 개구리",
    "ja": "紫の沼ガエル",
    "zh": "紫色沼蛙"
   },
   {
    "en": "Paper boat snail",
    "ko": "종이배 달팽이",
    "ja": "紙舟カタツムリ",
    "zh": "纸船蜗牛"
   },
   {
    "en": "Fountain pen mosquito",
    "ko": "만년필 모기",
    "ja": "万年筆の蚊",
    "zh": "钢笔蚊"
   },
   {
    "en": "Ribbon eel",
    "ko": "리본 장어",
    "ja": "リボンウナギ",
    "zh": "丝带鳗鱼"
   },
   {
    "en": "Inky lantern fish on legs",
    "ko": "등불 아귀",
    "ja": "提灯アンコウ",
    "zh": "灯笼鮟鱇"
   },
   {
    "en": "Wax seal spider",
    "ko": "봉인 거미",
    "ja": "封蝋グモ",
    "zh": "火漆蜘蛛"
   },
   {
    "en": "Blot butterfly",
    "ko": "얼룩 나비",
    "ja": "しみチョウ",
    "zh": "墨渍蝴蝶"
   },
   {
    "en": "Reed woven puppet",
    "ko": "갈대 인형",
    "ja": "葦編み人形",
    "zh": "芦苇编偶"
   },
   {
    "en": "Black pearl clam",
    "ko": "흑진주 조개",
    "ja": "黒真珠貝",
    "zh": "黑珍珠贝"
   },
   {
    "en": "Mushroom umbrella imp",
    "ko": "우산버섯 요정",
    "ja": "傘茸の妖精",
    "zh": "伞菇精灵"
   },
   {
    "en": "Folded paper heron",
    "ko": "종이 왜가리",
    "ja": "折り紙サギ",
    "zh": "折纸鹭"
   },
   {
    "en": "Ripple salamander",
    "ko": "물결 도롱뇽",
    "ja": "さざ波イモリ",
    "zh": "涟漪蝾螈"
   },
   {
    "en": "Giant crowned inkwell toad",
    "ko": "왕관 잉크두꺼비",
    "ja": "王冠インクガマ",
    "zh": "王冠墨水蟾蜍"
   },
   {
    "en": "Many tailed quill serpent",
    "ko": "깃펜 큰뱀",
    "ja": "羽根ペンの大蛇",
    "zh": "羽毛笔巨蟒"
   },
   {
    "en": "Massive reed shrine turtle",
    "ko": "갈대사원 거북",
    "ja": "葦社の亀",
    "zh": "芦苇神殿龟"
   }
  ]
 },
 {
  "id": "frost",
  "name": {
   "en": "Frost Observatory",
   "ko": "서리 천문대",
   "ja": "霜の天文台",
   "zh": "霜之天文台"
  },
  "knowledge": 1000,
  "maps": [
   {
    "en": "Aurora Trail",
    "ko": "오로라 오솔길",
    "ja": "オーロラの小道",
    "zh": "极光小径"
   },
   {
    "en": "Frozen Falls",
    "ko": "얼어붙은 폭포",
    "ja": "凍てつく滝",
    "zh": "冰封瀑布"
   },
   {
    "en": "Crystal Shelf",
    "ko": "수정 빙붕",
    "ja": "水晶の棚氷",
    "zh": "水晶冰架"
   },
   {
    "en": "Rime Observatory",
    "ko": "서리 관측소",
    "ja": "霜の観測所",
    "zh": "霜冻观测所"
   },
   {
    "en": "Telescope Terrace",
    "ko": "망원경 테라스",
    "ja": "望遠鏡テラス",
    "zh": "望远镜露台"
   },
   {
    "en": "Aurora Sanctuary",
    "ko": "오로라 성소",
    "ja": "オーロラの聖所",
    "zh": "极光圣所"
   }
  ],
  "creatures": [
   {
    "en": "Snow puff slime",
    "ko": "눈송이 젤리",
    "ja": "雪玉スライム",
    "zh": "雪团史莱姆"
   },
   {
    "en": "Crystal horn hare",
    "ko": "수정뿔 토끼",
    "ja": "水晶角ウサギ",
    "zh": "水晶角兔"
   },
   {
    "en": "Icicle beetle",
    "ko": "고드름 딱정벌레",
    "ja": "つらら甲虫",
    "zh": "冰锥甲虫"
   },
   {
    "en": "Woolly telescope moth",
    "ko": "망원경 나방",
    "ja": "望遠鏡ガ",
    "zh": "望远镜蛾"
   },
   {
    "en": "Frost feather owl",
    "ko": "서리 올빼미",
    "ja": "霜フクロウ",
    "zh": "霜羽猫头鹰"
   },
   {
    "en": "Snowglobe snail",
    "ko": "눈구슬 달팽이",
    "ja": "雪玉カタツムリ",
    "zh": "雪球蜗牛"
   },
   {
    "en": "Ice shard crab",
    "ko": "얼음조각 게",
    "ja": "氷片ガニ",
    "zh": "冰片蟹"
   },
   {
    "en": "Blue comet gecko",
    "ko": "혜성 도마뱀",
    "ja": "彗星ヤモリ",
    "zh": "彗星壁虎"
   },
   {
    "en": "Rime pinecone imp",
    "ko": "서리솔방울 꼬마",
    "ja": "霜松かさの小鬼",
    "zh": "霜松果小鬼"
   },
   {
    "en": "Tiny polar star sprite",
    "ko": "북극별 요정",
    "ja": "北極星の妖精",
    "zh": "北极星精灵"
   },
   {
    "en": "Glassflake jelly",
    "ko": "유리눈꽃 해파리",
    "ja": "氷花クラゲ",
    "zh": "玻璃雪花水母"
   },
   {
    "en": "Winter lantern stoat",
    "ko": "겨울등불 족제비",
    "ja": "冬灯のオコジョ",
    "zh": "冬灯鼬"
   },
   {
    "en": "Frostwing bat",
    "ko": "서리날개 박쥐",
    "ja": "霜翼コウモリ",
    "zh": "霜翼蝙蝠"
   },
   {
    "en": "Silver compass beetle",
    "ko": "은나침반 벌레",
    "ja": "銀羅針盤ムシ",
    "zh": "银罗盘甲虫"
   },
   {
    "en": "Aurora feather serpent",
    "ko": "오로라 뱀",
    "ja": "オーロラ蛇",
    "zh": "极光蛇"
   },
   {
    "en": "Great snow antler",
    "ko": "설원 뿔사슴",
    "ja": "雪原の角鹿",
    "zh": "雪原角鹿"
   },
   {
    "en": "Massive crystal telescope golem",
    "ko": "수정망원경 골렘",
    "ja": "水晶望遠鏡ゴーレム",
    "zh": "水晶望远镜魔像"
   },
   {
    "en": "Ancient aurora owl",
    "ko": "고대 오로라 올빼미",
    "ja": "古代オーロラのフクロウ",
    "zh": "古代极光猫头鹰"
   }
  ]
 },
 {
  "id": "ember",
  "name": {
   "en": "Ember Quarry",
   "ko": "잿불 채석장",
   "ja": "熾火の採石場",
   "zh": "余烬采石场"
  },
  "knowledge": 1800,
  "maps": [
   {
    "en": "Coal Terrace",
    "ko": "석탄 단구",
    "ja": "石炭の段丘",
    "zh": "煤炭阶地"
   },
   {
    "en": "Ruby Cavern",
    "ko": "홍옥 동굴",
    "ja": "紅玉の洞窟",
    "zh": "红宝石洞穴"
   },
   {
    "en": "Anvil Yard",
    "ko": "모루 마당",
    "ja": "金床の庭",
    "zh": "铁砧庭院"
   },
   {
    "en": "Magma Bridge",
    "ko": "마그마 다리",
    "ja": "マグマの橋",
    "zh": "岩浆桥"
   },
   {
    "en": "Copper Forge",
    "ko": "구리 대장간",
    "ja": "銅の鍛冶場",
    "zh": "铜铁匠铺"
   },
   {
    "en": "Ember Throne",
    "ko": "잿불 왕좌",
    "ja": "熾火の玉座",
    "zh": "余烬王座"
   }
  ],
  "creatures": [
   {
    "en": "Ember coal blob",
    "ko": "불씨 젤리",
    "ja": "火種スライム",
    "zh": "火种史莱姆"
   },
   {
    "en": "Obsidian beetle",
    "ko": "흑요석 딱정벌레",
    "ja": "黒曜石カブト",
    "zh": "黑曜石甲虫"
   },
   {
    "en": "Cinder mouse",
    "ko": "잿불 생쥐",
    "ja": "灰火ネズミ",
    "zh": "余烬鼠"
   },
   {
    "en": "Ruby crystal crab",
    "ko": "홍옥 게",
    "ja": "紅玉ガニ",
    "zh": "红宝石蟹"
   },
   {
    "en": "Smoke salamander",
    "ko": "연기 도롱뇽",
    "ja": "煙サンショウウオ",
    "zh": "烟雾蝾螈"
   },
   {
    "en": "Tiny anvil imp",
    "ko": "모루 꼬마",
    "ja": "金床の小鬼",
    "zh": "铁砧小鬼"
   },
   {
    "en": "Lava shell snail",
    "ko": "용암 달팽이",
    "ja": "溶岩カタツムリ",
    "zh": "熔岩蜗牛"
   },
   {
    "en": "Copper pickaxe mantis",
    "ko": "곡괭이 사마귀",
    "ja": "つるはしカマキリ",
    "zh": "铜镐螳螂"
   },
   {
    "en": "Ash wing moth",
    "ko": "재날개 나방",
    "ja": "灰羽ガ",
    "zh": "灰翼蛾"
   },
   {
    "en": "Smoldering pinecone imp",
    "ko": "타는 솔방울",
    "ja": "燃える松ぼっくり",
    "zh": "燃烧的松果"
   },
   {
    "en": "Ore horn tortoise",
    "ko": "광석뿔 거북",
    "ja": "鉱石角ガメ",
    "zh": "矿石角龟"
   },
   {
    "en": "Charcoal soot owl",
    "ko": "숯 올빼미",
    "ja": "炭フクロウ",
    "zh": "木炭猫头鹰"
   },
   {
    "en": "Glowing geode hedgehog",
    "ko": "정동 고슴도치",
    "ja": "晶洞ハリネズミ",
    "zh": "晶洞刺猬"
   },
   {
    "en": "Bellows lizard",
    "ko": "풀무 도마뱀",
    "ja": "ふいごトカゲ",
    "zh": "风箱蜥蜴"
   },
   {
    "en": "Magma lily sprite",
    "ko": "마그마꽃 요정",
    "ja": "マグマ花の妖精",
    "zh": "岩浆花精灵"
   },
   {
    "en": "Great obsidian ram",
    "ko": "흑요석 산양",
    "ja": "黒曜石の大羊",
    "zh": "黑曜石山羊"
   },
   {
    "en": "Giant molten forge tortoise",
    "ko": "용광로 거북",
    "ja": "溶鉱炉ガメ",
    "zh": "熔炉龟"
   },
   {
    "en": "Massive ember crown golem",
    "ko": "불꽃왕관 골렘",
    "ja": "炎冠ゴーレム",
    "zh": "火焰王冠魔像"
   }
  ]
 },
 {
  "id": "astral",
  "name": {
   "en": "Astral Archive",
   "ko": "별빛 서고",
   "ja": "星明かりの書庫",
   "zh": "星光书库"
  },
  "knowledge": 3000,
  "maps": [
   {
    "en": "Archive Landing",
    "ko": "서고 착륙장",
    "ja": "書庫の発着場",
    "zh": "书库着陆场"
   },
   {
    "en": "Constellation Garden",
    "ko": "별자리 정원",
    "ja": "星座の庭",
    "zh": "星座花园"
   },
   {
    "en": "Meteor Library",
    "ko": "운석 도서관",
    "ja": "隕石図書館",
    "zh": "陨石图书馆"
   },
   {
    "en": "Orbital Terrace",
    "ko": "궤도 테라스",
    "ja": "軌道テラス",
    "zh": "轨道露台"
   },
   {
    "en": "Crescent Bridge",
    "ko": "초승달 다리",
    "ja": "三日月の橋",
    "zh": "月牙桥"
   },
   {
    "en": "Starwheel Sanctuary",
    "ko": "별바퀴 성소",
    "ja": "星車の聖所",
    "zh": "星轮圣所"
   }
  ],
  "creatures": [
   {
    "en": "Tiny star jelly",
    "ko": "별 해파리",
    "ja": "星クラゲ",
    "zh": "小星水母"
   },
   {
    "en": "Crescent shelled snail",
    "ko": "초승달 달팽이",
    "ja": "三日月カタツムリ",
    "zh": "月牙蜗牛"
   },
   {
    "en": "Orbit ring beetle",
    "ko": "궤도 딱정벌레",
    "ja": "軌道カブト",
    "zh": "轨道甲虫"
   },
   {
    "en": "Paper constellation bird",
    "ko": "종이별 새",
    "ja": "紙星の鳥",
    "zh": "纸星鸟"
   },
   {
    "en": "Nebula rabbit",
    "ko": "성운 토끼",
    "ja": "星雲ウサギ",
    "zh": "星云兔"
   },
   {
    "en": "Floating hourglass imp",
    "ko": "모래시계 꼬마",
    "ja": "砂時計の小鬼",
    "zh": "沙漏小鬼"
   },
   {
    "en": "Meteor crab",
    "ko": "운석 게",
    "ja": "隕石ガニ",
    "zh": "陨石蟹"
   },
   {
    "en": "Comet tail ferret",
    "ko": "혜성 꼬리담비",
    "ja": "彗星尾のフェレット",
    "zh": "彗星尾貂"
   },
   {
    "en": "Prism moth",
    "ko": "프리즘 나방",
    "ja": "プリズムガ",
    "zh": "棱镜蛾"
   },
   {
    "en": "Cosmic compass turtle",
    "ko": "우주나침반 거북",
    "ja": "宇宙羅針盤ガメ",
    "zh": "宇宙罗盘龟"
   },
   {
    "en": "Tiny eclipse bat",
    "ko": "일식 박쥐",
    "ja": "日食コウモリ",
    "zh": "日食蝙蝠"
   },
   {
    "en": "Stardust quill hedgehog",
    "ko": "별먼지 고슴도치",
    "ja": "星屑ハリネズミ",
    "zh": "星尘刺猬"
   },
   {
    "en": "Ribbon galaxy eel",
    "ko": "은하 리본장어",
    "ja": "銀河リボンウナギ",
    "zh": "银河丝带鳗"
   },
   {
    "en": "Crystal eye owl",
    "ko": "수정눈 올빼미",
    "ja": "水晶眼のフクロウ",
    "zh": "水晶眼猫头鹰"
   },
   {
    "en": "Moon seed sprite",
    "ko": "달씨앗 요정",
    "ja": "月の種の妖精",
    "zh": "月种精灵"
   },
   {
    "en": "Great celestial archive dragon",
    "ko": "천상서고 용",
    "ja": "天上書庫の竜",
    "zh": "天穹书库龙"
   },
   {
    "en": "Massive ringed planet golem",
    "ko": "고리행성 골렘",
    "ja": "環の惑星ゴーレム",
    "zh": "光环行星魔像"
   },
   {
    "en": "Ancient star crowned sphinx",
    "ko": "별왕관 스핑크스",
    "ja": "星冠のスフィンクス",
    "zh": "星冠斯芬克斯"
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
