// Writes the labelled fixture for `pnpm perf:meaning-quality`: `vault.json` (an LLM wiki of wiki pages
// and Markdown sources in Korean, English and mixed text, as path → file text) and `questions.json`
// (60 questions with the files that answer them). `content.mjs` holds the hand-written answer pages,
// near-miss pages and questions; the rest are seeded distractors about the same fictional product.
// The vault is JSON rather than Markdown files because the repository's Markdown is held to English.
// Usage: node tests/fixtures/meaning-search/build-fixture.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEAR_MISSES, PAGES, QUESTIONS, SOURCES } from './content.mjs';

const OUT = dirname(fileURLToPath(import.meta.url));

let seed = 20261119;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (list) => list[Math.floor(rnd() * list.length)];
const pickN = (list, n) => {
  const copy = [...list];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const pad = (n) => String(n).padStart(2, '0');
const sha = (text) => createHash('sha256').update(text).digest('hex');
// Attaches the particle that fits the word's last syllable: [after a vowel, after a consonant].
const josa = (word, [vowel, consonant]) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? consonant : vowel);
};
const NEUN = ['는', '은'];
const GA = ['가', '이'];

const files = new Map();
const sources = new Map(Object.entries(SOURCES));

const DEPOTS_EN = ['Riverside', 'Eastfield', 'Millbrook', 'Westlake', 'Southport', 'Cedar Hill', 'Ashford', 'Bayview', 'Stonebridge', 'Oakridge', 'Fairmont', 'Elmwood', 'Kingsway', 'Larchmont', 'Brookfield'];
const DEPOTS_KO = ['대전 2센터', '수원 북부센터', '부산 신항센터', '인천 남동센터', '청주 오창센터', '천안 서북센터', '울산 온산센터', '김해센터', '원주센터', '전주센터', '창원센터', '포항센터', '고양센터', '용인 처인센터', '평택센터'];
const CUSTOMERS_EN = ['Greenleaf Market', 'Corner Basket', 'Harvest Lane', 'Bluebell Grocers', 'Daily Pantry', 'Maple Row Foods', 'Sunrise Fresh', 'Pinecrest Market', 'Tallgrass Organics', 'Northwind Deli', 'Little Orchard', 'Copperpot Kitchen'];
const CUSTOMERS_KO = ['한빛마트', '늘봄식품', '바른장터', '새벽들 식자재', '푸른들 마켓', '다온 반찬', '소담 베이커리', '해오름 정육', '온누리 수산', '단골상회', '이음 푸드', '모아 마켓'];
const RELEASES = ['Heron', 'Osprey', 'Plover', 'Egret', 'Ibis', 'Puffin', 'Gannet', 'Curlew', 'Dunlin', 'Sandpiper', 'Avocet', 'Godwit', 'Lapwing', 'Merlin', 'Shrike', 'Wren'];
const CODES = ['TW-ALRM-08', 'TW-ALRM-11', 'TW-ALRM-29', 'TW-ALRM-31', 'TW-SYNC-01', 'TW-SYNC-06', 'TW-SYNC-07', 'TW-SYNC-12', 'TW-ROUTE-05', 'TW-ROUTE-13', 'TW-PAY-02', 'TW-PAY-10', 'TW-SCAN-03', 'TW-SCAN-14', 'TW-AUTH-06'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'];
const date = () => `2026-${pad(int(1, 10))}-${pad(int(1, 28))}`;

// wiki page writer

function sourceLineFor(sourcePath, text) {
  const lines = (sources.get(sourcePath) ?? '').split('\n');
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  let best = 1;
  let bestScore = -1;
  lines.forEach((line, index) => {
    if (!line.trim() || line.startsWith('#')) return;
    const score = (line.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((word) => words.has(word)).length;
    if (score > bestScore) { best = index + 1; bestScore = score; }
  });
  return best;
}

function wikiPage(slug, { title, summary, facts, decisions, cites, open = [], compiled = '2026-11-01T09:00:00Z' }) {
  const cite = (text) => `${text} [[src:${cites}#l${sourceLineFor(cites, text)}]]`;
  const body = [
    '---',
    `title: ${title}`,
    'created_by: agent:claude',
    `compiled_at: ${compiled}`,
    'sources:',
    `  - ${cites}`,
    'source_hash:',
    `  ${cites}: ${sha(sources.get(cites) ?? '')}`,
    'status: draft',
    `summary: ${summary}`,
    '---',
    '',
    '## Summary',
    '',
    summary,
    '',
    '## Facts',
    '',
    ...facts.map((fact) => `- ${cite(fact)}`),
    '',
    '## Decisions',
    '',
    ...decisions.map((decision) => `- ${cite(decision)}`),
    '',
    '## Open questions',
    '',
    ...(open.length ? open.map((item) => `- ${item}`) : ['- None recorded.']),
    '',
    '## Not in sources',
    '',
    '- Nothing beyond the cited sources.',
    '',
  ].join('\n');
  files.set(`wiki/${slug}.md`, body);
}

// distractor sources

const OPS_UPDATES_EN = [
  (d) => `${d} is short two drivers on Saturdays until the new hires finish training.`,
  (d) => `${d} reported ${int(2, 9)} late departures because the gate scanner was slow.`,
  (d) => `${d} wants an extra freezer truck for the holiday weeks.`,
  (d) => `${d} finished repainting the loading bay markings.`,
  (d) => `${d} had ${int(1, 5)} vans in the workshop this week.`,
  (d) => `${d} asked whether the morning wave can start fifteen minutes later in winter.`,
  (d) => `${d} trialled reusable crates for bakery customers.`,
  (d) => `${d} saw more failed attempts in new apartment blocks without access codes.`,
  (d) => `${d} will host the regional safety walk next month.`,
  (d) => `${d} recorded ${int(1, 6)} excursions, all under ten minutes.`,
];
const OPS_UPDATES_KO = [
  (d) => `${d}는 신규 기사 교육이 끝날 때까지 토요일에 기사 두 명이 부족하다.`,
  (d) => `${d}는 출입 스캐너가 느려서 출차가 ${int(2, 9)}번 늦었다.`,
  (d) => `${d}는 명절 주간에 냉동 트럭을 한 대 더 요청했다.`,
  (d) => `${d}는 상차장 바닥 표시를 다시 칠했다.`,
  (d) => `${d}는 이번 주 차량 ${int(1, 5)}대가 정비소에 들어갔다.`,
  (d) => `${d}는 겨울철 아침 출차를 15분 늦출 수 있는지 물었다.`,
  (d) => `${d}는 베이커리 고객에게 재사용 상자를 시험했다.`,
  (d) => `${d}는 출입 번호가 없는 신축 아파트에서 배송 실패가 늘었다.`,
  (d) => `${d}는 다음 달 지역 안전 점검을 맡는다.`,
  (d) => `${d}에서 온도 이탈이 ${int(1, 6)}건 있었고 모두 10분 미만이었다.`,
];
const OPS_ACTIONS_EN = ['Share the revised loading plan before Friday.', 'Check the spare sensor stock at every depot.', 'Ask finance about overtime for the holiday weeks.', 'Collect photos of blocked entrances for the planner team.', 'Review the van rental contract before renewal.'];
const OPS_ACTIONS_KO = ['금요일 전까지 수정한 상차 계획을 공유한다.', '센터마다 예비 센서 재고를 확인한다.', '명절 주간 초과 근무 수당을 재무팀에 묻는다.', '막힌 출입구 사진을 모아 배차팀에 넘긴다.', '차량 임대 계약을 갱신 전에 검토한다.'];

function opsSync(index) {
  const lang = index % 3;
  const day = date();
  const depots = pickN([...DEPOTS_EN, ...DEPOTS_KO], 4);
  const path = `sources/ops-sync-${day}-${index}.md`;
  let text;
  if (lang === 0) {
    text = `# Ops sync — ${day}\n\n## Attendees\n\nDepot leads, control room, planning\n\n## Updates\n\n${depots.map((d) => `- ${pick(OPS_UPDATES_EN)(d)}`).join('\n')}\n\n## Actions\n\n${pickN(OPS_ACTIONS_EN, 2).map((a) => `- ${a}`).join('\n')}\n`;
  } else if (lang === 1) {
    text = `# 운영 회의 — ${day}\n\n## 참석\n\n센터장, 관제실, 배차팀\n\n## 현황\n\n${depots.map((d) => `- ${pick(OPS_UPDATES_KO)(d)}`).join('\n')}\n\n## 할 일\n\n${pickN(OPS_ACTIONS_KO, 2).map((a) => `- ${a}`).join('\n')}\n`;
  } else {
    text = `# Weekly ops sync ${day}\n\n## 현황\n\n${depots.map((d, i) => `- ${(i % 2 ? pick(OPS_UPDATES_EN) : pick(OPS_UPDATES_KO))(d)}`).join('\n')}\n\n## Actions\n\n- ${pick(OPS_ACTIONS_KO)}\n- ${pick(OPS_ACTIONS_EN)}\n`;
  }
  sources.set(path, text);
  return path;
}

const COMPONENTS = [['the alerting service', '알림 서비스'], ['the driver app', '기사 앱'], ['the route planner', '배차 엔진'], ['the billing worker', '정산 작업기'], ['the depot scanner gateway', '센터 스캐너 게이트웨이'], ['the customer portal', '고객 포털']];
const SYMPTOMS = [
  [(m) => `stopped sending push messages for ${m} minutes`, (m) => `${m}분 동안 푸시 메시지를 보내지 못했다`],
  [(m) => `showed stale stop lists for ${m} minutes`, (m) => `${m}분 동안 오래된 정류장 목록을 보여 줬다`],
  [(m) => `double-counted failed attempts for ${m} minutes`, (m) => `${m}분 동안 배송 실패를 두 번씩 셌다`],
  [(m) => `rejected valid labels for ${m} minutes`, (m) => `${m}분 동안 정상 라벨을 거부했다`],
  [(m) => `lost readings from ${m} vehicles`, (m) => `차량 ${m}대의 측정값을 잃었다`],
  [(m) => `timed out on login for ${m} minutes`, (m) => `${m}분 동안 로그인이 시간 초과로 실패했다`],
];
const FIXES = [
  ['rolled back the last deploy', '마지막 배포를 되돌렸다'],
  ['restarted the queue consumer', '큐 소비자를 다시 시작했다'],
  ['raised the connection pool limit', '연결 풀 한도를 올렸다'],
  ['renewed an expired TLS certificate', '만료된 TLS 인증서를 갱신했다'],
  ['replayed the missed messages from the buffer', '버퍼에 남은 메시지를 다시 보냈다'],
];

const incidents = [];
function incident(index) {
  const code = CODES[index % CODES.length];
  const comp = pick(COMPONENTS);
  const sym = pick(SYMPTOMS);
  const fix = pick(FIXES);
  const m = int(6, 95);
  const day = date();
  const ko = index % 2 === 1;
  const path = `sources/incident-${day}-${code.toLowerCase()}.md`;
  const text = ko
    ? `# 장애 보고 ${code} (${day})\n\n## 경과\n\n- ${pad(int(0, 23))}:${pad(int(0, 59))} 관제실이 ${code} 경보를 받았다.\n- ${josa(comp[1], GA)} ${sym[1](m)}.\n- 당직 개발자가 ${fix[1]}.\n\n## 영향\n\n주문 ${int(20, 900)}건이 영향을 받았다.\n\n## 후속 조치\n\n- 같은 증상을 잡는 대시보드 패널을 추가한다.\n`
    : `# Incident report ${code} (${day})\n\n## Timeline\n\n- ${pad(int(0, 23))}:${pad(int(0, 59))} the control room received ${code}.\n- ${comp[0][0].toUpperCase()}${comp[0].slice(1)} ${sym[0](m)}.\n- The on-call engineer ${fix[0]}.\n\n## Impact\n\n${int(20, 900)} orders were affected.\n\n## Follow-up\n\n- Add a dashboard panel that catches the same symptom.\n`;
  sources.set(path, text);
  incidents.push({ code, comp, sym, fix, m, day, ko, path });
}

const INTERVIEW_LINES_EN = ['They want the receiving window confirmed the day before.', 'Drivers sometimes block the loading bay during the lunch rush.', 'They like seeing a photo when goods arrive.', 'Invoices are hard to match against their purchase orders.', 'They would order more frozen goods if delivery were earlier.', 'Their staff cannot find the returns form in the portal.', 'They asked for a single contact for all their stores.', 'Crates stack too high for their back door.'];
const INTERVIEW_LINES_KO = ['입고 시간을 하루 전에 확정해 주면 좋겠다고 했다.', '점심시간에 기사가 하역장을 막을 때가 있다고 했다.', '도착 사진을 보는 게 좋다고 했다.', '청구서를 발주서와 맞추기 어렵다고 했다.', '배송이 더 이르면 냉동 상품을 더 주문하겠다고 했다.', '직원들이 포털에서 반품 양식을 찾지 못한다고 했다.', '매장 전체를 맡는 담당자 한 명을 원했다.', '상자를 너무 높이 쌓아 뒷문으로 들이기 어렵다고 했다.'];
function interview(index) {
  const ko = index % 2 === 1;
  const customer = ko ? CUSTOMERS_KO[index % CUSTOMERS_KO.length] : CUSTOMERS_EN[index % CUSTOMERS_EN.length];
  const path = `sources/interview-${index}.md`;
  const text = ko
    ? `# 고객 인터뷰: ${customer} 매장 관리자\n\n## 들은 것\n\n${pickN(INTERVIEW_LINES_KO, 4).map((l) => `- ${l}`).join('\n')}\n\n## 다음\n\n- 계정 담당자가 한 달 뒤 다시 연락한다.\n`
    : `# Interview: store manager at ${customer}\n\n## What we heard\n\n${pickN(INTERVIEW_LINES_EN, 4).map((l) => `- ${l}`).join('\n')}\n\n## Next\n\n- The account manager follows up in a month.\n`;
  sources.set(path, text);
}

function inspection(index) {
  const plate = `${int(10, 99)}${pick(['가', '나', '다', '라', '마'])} ${int(1000, 9999)}`;
  const ko = index % 2 === 0;
  const path = `sources/vehicle-inspection-${index}.md`;
  const text = ko
    ? `# 차량 점검 기록 — ${plate}\n\n## 항목\n\n- 타이어: ${pick(['양호', '앞바퀴 마모'])}\n- 냉동기 가동 시간: ${int(800, 9000)}시간\n- 문 고무 패킹: ${pick(['양호', '닳음, 교체 필요'])}\n- 센서: ${pick(['정상', '배터리 낮음'])}\n\n## 메모\n\n- 점검자: ${pick(['오전', '오후'])} 정비 담당\n`
    : `# Vehicle inspection — ${plate}\n\n## Checks\n\n- Tyres: ${pick(['good', 'front wear'])}\n- Refrigeration unit hours: ${int(800, 9000)}\n- Door seal: ${pick(['good', 'worn, replace'])}\n- Sensor: ${pick(['normal', 'low battery'])}\n\n## Notes\n\n- Inspected by the ${pick(['morning', 'afternoon'])} workshop crew.\n`;
  sources.set(path, text);
}

const opsPaths = Array.from({ length: 40 }, (_, i) => opsSync(i));
for (let i = 0; i < 30; i++) incident(i);
for (let i = 0; i < 20; i++) interview(i);
for (let i = 0; i < 14; i++) inspection(i);

// answer pages

for (const page of [...PAGES, ...NEAR_MISSES]) wikiPage(page.slug, { ...page, cites: page.cites ?? pick(opsPaths) });

// distractor wiki pages

const allDepots = [...DEPOTS_EN.map((d) => [d, 'en']), ...DEPOTS_KO.map((d) => [d, 'ko'])];
allDepots.forEach(([depot, lang], index) => {
  const cites = pick(opsPaths);
  const [n, area, v, t, hh, mm, s] = [int(18, 64), int(2, 9) * 1000, int(8, 30), int(2, 9), int(3, 5), pick(['00', '15', '30', '45']), int(14, 31)];
  const mixed = index % 4 === 3;
  if (lang === 'en' && !mixed) {
    wikiPage(`depot-${index}`, { cites, title: `${depot} depot profile`, summary: `Size, fleet and schedule of the ${depot} depot.`,
      facts: [`${depot} serves ${n} postcodes from a ${area.toLocaleString('en')} m² building.`, `It runs ${v} refrigerated vans and ${t} freezer trucks.`, `The first wave leaves at 0${hh}:${mm}.`, `Average stops per route last quarter: ${s}.`],
      decisions: [pick([`${depot} added a second loading door to cut queueing at the morning wave.`, `${depot} moved its deep cleaning to Sundays.`, `${depot} keeps two spare sensors for every ten vehicles.`])] });
  } else if (lang === 'ko' && !mixed) {
    wikiPage(`depot-${index}`, { cites, title: `${depot} 현황`, summary: `${depot}의 규모, 차량, 출차 시간을 정리했다.`,
      facts: [`${depot}는 우편번호 ${n}개 지역을 맡고, 건물 면적은 ${area.toLocaleString('en')}㎡다.`, `냉장 밴 ${v}대와 냉동 트럭 ${t}대를 운영한다.`, `첫 출차는 ${hh}시 ${mm}분이다.`, `지난 분기 경로당 평균 정류장 수는 ${s}개였다.`],
      decisions: [pick([`${depot}는 아침 출차 대기를 줄이려고 상차 문을 하나 더 냈다.`, `${depot}는 대청소를 일요일로 옮겼다.`, `${depot}는 차량 10대마다 예비 센서 두 개를 둔다.`])] });
  } else {
    wikiPage(`depot-${index}`, { cites, title: `${depot} depot 현황`, summary: `${depot}의 fleet과 schedule 요약.`,
      facts: [`${depot}는 postcode ${n}개를 맡는다.`, `Refrigerated van ${v}대, freezer truck ${t}대를 운영한다.`, `First wave 출차는 0${hh}:${mm}.`, `Route당 평균 stop 수는 ${s}개.`],
      decisions: [`${depot}는 spare sensor를 차량 10대당 두 개 둔다.`] });
  }
});

allDepots.forEach(([depot, lang], index) => {
  const cites = pick(opsPaths);
  const week = int(10, 44);
  const [p, d, e, m, f, o] = [(90 + rnd() * 9).toFixed(1), int(3000, 16000), int(0, 9), int(4, 40), int(10, 120), int(20, 180)];
  if (lang === 'en') {
    wikiPage(`weekly-review-${index}`, { cites, title: `${depot} weekly review, week ${week}`, summary: `Service numbers for ${depot} in week ${week}.`,
      facts: [`On-time rate was ${p}% across ${d} deliveries.`, `${e} temperature excursions were logged; the longest lasted ${m} minutes.`, `${f} failed attempts, mostly ${pick(['no one home', 'no access code', 'blocked entrance', 'wrong address'])}.`, `Driver overtime totalled ${o} hours.`],
      decisions: [pick([`Move the ${pick(['north', 'east', 'river', 'hill'])} route start ten minutes earlier next week.`, `Ask the account manager to call ${pick(CUSTOMERS_EN)} about receiving hours.`, `Add one van to the Saturday plan.`])] });
  } else {
    wikiPage(`weekly-review-${index}`, { cites, title: `${depot} 주간 리뷰 ${week}주차`, summary: `${depot}의 ${week}주차 서비스 지표다.`,
      facts: [`정시 도착률은 ${p}%였고 배송은 ${d}건이었다.`, `온도 이탈이 ${e}건 기록됐고 가장 긴 것은 ${m}분이었다.`, `배송 실패는 ${f}건이었고 주로 ${pick(['부재', '출입 번호 없음', '출입구 막힘', '주소 오류'])} 때문이었다.`, `기사 초과 근무는 모두 ${o}시간이었다.`],
      decisions: [pick([`다음 주에는 ${pick(['북부', '동부', '강변', '언덕'])} 경로 출발을 10분 앞당긴다.`, `계정 담당자가 ${pick(CUSTOMERS_KO)}에 입고 시간을 다시 묻는다.`, `토요일 배차에 밴 한 대를 더한다.`])] });
  }
});

const FEATURES = [
  ['added a dark mode for night shifts', '야간 근무용 어두운 화면을 넣었다'],
  ['made the stop list load faster on older phones', '오래된 휴대폰에서 정류장 목록이 더 빨리 뜨게 했다'],
  ['fixed a crash when scanning damaged barcodes', '훼손된 바코드를 스캔할 때 앱이 꺼지던 문제를 고쳤다'],
  ['moved the break reminder to the top bar', '휴식 알림을 상단 막대로 옮겼다'],
  ['showed the compartment temperature on the lock screen', '잠금 화면에 적재칸 온도를 보여 줬다'],
  ['let drivers report a blocked entrance', '기사가 막힌 출입구를 신고할 수 있게 했다'],
  ['reduced battery use while navigating', '길 안내 중 배터리 사용을 줄였다'],
  ['added a checklist before leaving the depot', '센터 출발 전 확인 목록을 넣었다'],
  ['showed access notes for the next stop earlier', '다음 정류장의 출입 메모를 더 일찍 보여 줬다'],
  ['grouped stops in the same building', '같은 건물의 정류장을 묶어 보여 줬다'],
];
RELEASES.forEach((name, index) => {
  const cites = pick(opsPaths);
  const ko = index % 2 === 1;
  const feats = pickN(FEATURES, 3);
  const version = `4.${index + 1}`;
  wikiPage(`release-${name.toLowerCase()}`, ko
    ? { cites, title: `기사 앱 ${name} 릴리스`, summary: `기사 앱 ${version} (${name}) 변경 사항이다.`,
      facts: feats.map(([, k]) => `${name} 릴리스는 ${k}.`), decisions: [`${name}에서는 예전 스캐너 경로를 설정 안에 한 번 더 남겨 두었다.`] }
    : { cites, title: `Driver app ${name} release`, summary: `Changes in driver app ${version} (${name}).`,
      facts: feats.map(([e]) => `The ${name} release ${e}.`), decisions: [`${name} kept the old scanner path behind a setting for one more release.`] });
});

incidents.forEach((inc, index) => {
  wikiPage(`incident-${index}`, inc.ko
    ? { cites: inc.path, title: `${inc.code} 장애 (${inc.day})`, summary: `${inc.comp[1]} 장애 요약이다.`,
      facts: [`${inc.day}에 ${josa(inc.comp[1], GA)} ${inc.sym[1](inc.m)}.`, `당직 개발자가 ${inc.fix[1]}.`],
      decisions: ['같은 증상을 잡는 대시보드 패널을 추가하기로 했다.'] }
    : { cites: inc.path, title: `${inc.code} incident (${inc.day})`, summary: `Summary of the ${inc.comp[0].replace('the ', '')} incident.`,
      facts: [`On ${inc.day}, ${inc.comp[0]} ${inc.sym[0](inc.m)}.`, `The on-call engineer ${inc.fix[0]}.`],
      decisions: ['A dashboard panel that catches the same symptom will be added.'] });
});

const customers = [...CUSTOMERS_EN.map((c) => [c, 'en']), ...CUSTOMERS_KO.map((c) => [c, 'ko'])];
customers.forEach(([customer, lang], index) => {
  const cites = pick(opsPaths);
  const [k, h1, h2] = [int(2, 40), int(5, 9), int(11, 15)];
  const tier = pick(['Basic', 'Pro', 'Enterprise']);
  if (lang === 'en') {
    wikiPage(`account-${index}`, { cites, title: `${customer} account`, summary: `Delivery terms for ${customer}.`,
      facts: [`${customer} has ${k} stores receiving deliveries ${pick(['six days a week', 'on weekdays', 'every day'])}.`, `Receiving hours are ${pad(h1)}:00–${h2}:00.`, `Contract tier: ${tier}.`, `The main contact is the ${pick(['regional buyer', 'operations lead', 'store manager at the flagship'])}.`],
      decisions: [pick([`Deliveries to the ${customer} flagship moved to the rear entrance.`, `${customer} receives crates instead of cardboard boxes.`, `${customer} asked for a single monthly statement for all stores.`])] });
  } else {
    wikiPage(`account-${index}`, { cites, title: `${customer} 거래 조건`, summary: `${customer}의 배송 조건이다.`,
      facts: [`${josa(customer, NEUN)} 매장 ${k}곳이 ${pick(['주 6일', '평일', '매일'])} 배송을 받는다.`, `입고 시간은 ${h1}시부터 ${h2}시까지다.`, `계약 등급: ${tier}.`, `주 담당자는 ${pick(['지역 구매 담당자', '운영 책임자', '본점 매장 관리자'])}다.`],
      decisions: [pick([`${customer} 본점 배송은 뒷문으로 옮겼다.`, `${customer}에는 종이 상자 대신 재사용 상자로 보낸다.`, `${josa(customer, NEUN)} 모든 매장의 월별 명세서를 하나로 받기로 했다.`])] });
  }
});

for (let i = 0; i < 10; i++) {
  const cites = pick(opsPaths);
  const glacier = i % 2 === 1;
  const lot = `${glacier ? 'GL' : 'FL'}-${2201 + i * 7}`;
  const [n, k, x] = [int(200, 900), int(0, 25), (rnd() * 0.6).toFixed(2)];
  wikiPage(`sensor-lot-${lot.toLowerCase()}`, i % 3 === 0
    ? { cites, title: `센서 로트 ${lot}`, summary: `${glacier ? 'Glacier' : 'Frostline'} 센서 ${lot} 로트의 입고 기록이다.`,
      facts: [`${lot} 로트는 ${n}개가 ${pick(MONTHS)}에 들어왔다.`, `${k}개가 교정에 실패해 반품됐다.`, `교정 오차는 평균 ${x}도였다.`],
      decisions: [k > 15 ? `${lot} 로트는 회수했다.` : `${lot} 로트는 계속 쓴다.`] }
    : { cites, title: `Sensor lot ${lot}`, summary: `Receiving record for ${glacier ? 'Glacier' : 'Frostline'} lot ${lot}.`,
      facts: [`${n} units of lot ${lot} arrived in ${pick(MONTHS)}.`, `${k} units failed calibration and were returned.`, `Calibration drift averaged ${x} °C.`],
      decisions: [k > 15 ? `Lot ${lot} was recalled.` : `Lot ${lot} stays in service.`] });
}

for (const [path, text] of sources) files.set(path, text);

// write

const sorted = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)));
const counters = { ko: 0, en: 0, cross: 0 };
const questions = QUESTIONS.map(([set, exact, question, gold]) => {
  const [group, kind] = set.split(':');
  counters[group] += 1;
  for (const id of gold) if (!sorted[id]) throw new Error(`gold ${id} missing`);
  return { id: `${group}-${pad(counters[group])}`, set: group, ...(kind ? { kind } : {}), exactTerm: Boolean(exact), question, gold };
});
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'vault.json'), `{\n  "files": {\n${Object.entries(sorted).map(([p, t]) => `    ${JSON.stringify(p)}: ${JSON.stringify(t)}`).join(',\n')}\n  }\n}\n`);
writeFileSync(join(OUT, 'questions.json'), `{\n  "k": 8,\n  "questions": [\n${questions.map((q) => `    ${JSON.stringify(q)}`).join(',\n')}\n  ]\n}\n`);
const wiki = Object.keys(sorted).filter((p) => p.startsWith('wiki/')).length;
console.log(JSON.stringify({ files: Object.keys(sorted).length, wiki, sources: Object.keys(sorted).length - wiki, questions: questions.length, exact: questions.filter((q) => q.exactTerm).length }));
