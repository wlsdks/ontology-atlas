#!/usr/bin/env node
/**
 * Demo-recording vault generator — **outside the repository**, with its own git.
 *
 * **Why not a dogfood copy.** The ledger's recording-setup gate (2026-07-29)
 * asked for a "dogfood copy". The owner widened it on 2026-07-30:
 * *"dogfood말고 내용 좋은걸로 하나 만들어줘도됨"* (a good-content vault instead of
 * dogfood is fine). There is a reason: dogfood describes **this tool itself**, so
 * node names are internal vocabulary like `mcp-server` and `topology-map-v2` —
 * and this clip's primary audience includes **people who do not know what an
 * agent is**, to whom that vocabulary reads as gibberish.
 *
 * So the subject is a **music streaming service**. Playback, catalogue,
 * discovery, subscription, royalties, and accounts read without explanation, and
 * above all the **dependencies this clip shows are intuitive** — one line,
 * "royalties lean on the play log", is the whole argument for why a graph is
 * needed.
 *
 * **Why outside the repository.** Ledger: *"원본 repo 밖 별도 폴더 + 자체 git
 * 초기화 — repo `.git` 오염 금지 · QA 픽스처 볼트 촬영 금지"* (a separate folder
 * outside the source repo with its own git init; do not pollute the repo's
 * `.git`, and do not film the QA fixture vault). The recording shows committing
 * from inside the vault, so this repository's git must not be touched, and the
 * fixture vault exposes English-name and copy bugs on camera.
 *
 * Usage:
 *
 *   node scripts/make-demo-vault.mjs [target path]
 *   default: ../atlas-demo-music
 */
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] ?? '../atlas-demo-music');

/** Domains — how this business divides up. */
const DOMAINS = [
  ['playback', '재생', 'Playback', '사용자가 실제로 소리를 듣는 구간. 스트림을 열고, 끊기지 않게 유지하고, 무엇을 언제 들었는지 남긴다.'],
  ['catalog', '카탈로그', 'Catalog', '무엇을 들을 수 있는가. 트랙·앨범·아티스트의 정체와 권리 상태를 보관한다.'],
  ['discovery', '추천', 'Discovery', '무엇을 들을지 고르는 것을 돕는다. 검색과 추천, 그리고 그 결과가 왜 그런지 설명하는 근거까지.'],
  ['subscription', '구독', 'Subscription', '누가 무엇을 들을 권리를 가지는가. 요금제·결제·체험·해지가 여기 산다.'],
  ['royalty', '정산', 'Royalty', '들은 만큼 권리자에게 돌아가는 돈. 재생 기록을 돈으로 바꾸는 계산과 그 감사 흔적.'],
  ['account', '계정', 'Account', '사람과 기기의 정체. 로그인, 가족 공유, 기기 등록 한도.'],
];

/**
 * Capabilities — [slug, domain, Korean, English, definition, dependencies
 * (capability slugs within this same array)].
 *
 * **Filling in the definitions is the point of this file.** Name-only nodes fill
 * the map but explain nothing, leaving nothing to show when a node is clicked on
 * camera.
 */
const CAPABILITIES = [
  ['stream-open', 'playback', '스트림 열기', 'Open a stream', '재생 버튼을 누른 순간 권리를 확인하고 오디오 세그먼트를 내려보내기 시작한다. 실패하면 그 이유(권리 없음·지역 제한·기기 한도)를 사용자 말로 돌려준다.', ['entitlement-check', 'device-register']],
  ['adaptive-bitrate', 'playback', '화질 자동 조절', 'Adaptive bitrate', '회선이 좁아지면 음질을 낮춰 끊김을 막고, 넓어지면 되돌린다. 사용자는 이 전환을 눈치채지 못해야 한다.', ['stream-open']],
  ['offline-cache', 'playback', '오프라인 저장', 'Offline cache', '기기에 암호화해 보관하고 구독이 끊기면 만료시킨다. 보관 기간은 권리 계약이 정한다.', ['entitlement-check', 'track-rights']],
  ['play-log', 'playback', '재생 기록', 'Play log', '무엇을 언제 얼마나 들었는지 append-only 로 남긴다. **정산과 추천이 둘 다 이 기록에 기댄다** — 이 서비스에서 가장 많이 참조되는 사실이다.', ['stream-open']],
  ['gapless-queue', 'playback', '끊김 없는 대기열', 'Gapless queue', '다음 트랙을 미리 열어 두어 곡 사이 침묵을 없앤다. 앨범을 통째로 듣는 사람에게 이것이 곧 품질이다.', ['stream-open']],

  ['track-register', 'catalog', '트랙 등록', 'Register a track', '음원과 메타데이터를 받아 검수한 뒤 카탈로그에 올린다. 중복 등록과 잘못된 아티스트 연결을 여기서 막는다.', []],
  ['track-rights', 'catalog', '권리 상태', 'Track rights', '어느 지역에서 언제까지 들려줄 수 있는가. 계약이 끝나면 재생과 오프라인 저장이 함께 막혀야 한다.', ['track-register']],
  ['artist-identity', 'catalog', '아티스트 정체', 'Artist identity', '같은 이름의 다른 아티스트를 가르고, 같은 아티스트의 다른 표기를 합친다. 정산이 사람을 틀리면 돈이 틀린다.', ['track-register']],
  ['album-grouping', 'catalog', '앨범 묶음', 'Album grouping', '트랙을 발매 단위로 묶는다. 재발매·리마스터가 원본과 같은 것으로 세어지지 않게 한다.', ['track-register']],
  ['takedown', 'catalog', '내리기', 'Takedown', '권리 문제나 요청으로 트랙을 즉시 내린다. 이미 오프라인에 내려간 사본까지 만료시켜야 완료다.', ['track-rights', 'offline-cache']],

  ['search', 'discovery', '검색', 'Search', '오타와 외국어 표기를 견디고 찾는다. 찾은 이유(제목·아티스트·가사 일치)를 함께 보여준다.', ['artist-identity', 'album-grouping']],
  ['recommend-daily', 'discovery', '오늘의 추천', 'Daily picks', '재생 기록에서 취향을 추정해 매일 다른 묶음을 만든다. 왜 추천했는지 한 줄로 설명할 수 있어야 내보낸다.', ['play-log', 'taste-profile']],
  ['taste-profile', 'discovery', '취향 프로필', 'Taste profile', '사람마다의 선호를 벡터로 유지한다. 최근 재생에 더 큰 가중치를 주고, 한 번의 이상한 재생이 프로필을 흔들지 않게 한다.', ['play-log']],
  ['radio-seed', 'discovery', '무한 재생', 'Radio', '한 트랙에서 출발해 비슷한 것을 끝없이 잇는다. 같은 아티스트만 반복되지 않게 다양성을 강제한다.', ['taste-profile', 'gapless-queue']],
  ['editorial-list', 'discovery', '에디터 추천', 'Editorial lists', '사람이 고른 묶음. 알고리즘이 못 잡는 맥락(계절·사건·장르 흐름)을 사람이 넣는다.', ['album-grouping']],

  ['plan-catalog', 'subscription', '요금제', 'Plans', '무료·개인·가족·학생. 각 요금제가 무엇을 허락하는지가 한 곳에 있어야 권리 확인이 흔들리지 않는다.', []],
  ['entitlement-check', 'subscription', '권리 확인', 'Entitlement check', '이 사람이 지금 이 트랙을 들을 수 있는가. 요금제·지역·기기 한도를 한 번에 판정한다.', ['plan-catalog', 'track-rights']],
  ['payment-charge', 'subscription', '결제', 'Charge', '주기마다 청구하고 실패를 재시도한다. 실패가 곧 해지가 되지 않게 유예를 둔다.', ['plan-catalog']],
  ['trial-grant', 'subscription', '체험 제공', 'Trial', '한 사람에게 한 번만. 결제 수단을 미리 받되 체험 중에는 청구하지 않는다.', ['plan-catalog', 'payment-charge']],
  ['family-share', 'subscription', '가족 공유', 'Family share', '한 요금제를 여러 계정이 나눈다. 같은 집에 산다는 것을 어떻게 확인하는지가 정책의 핵심이다.', ['plan-catalog', 'household-verify']],
  ['cancel-flow', 'subscription', '해지', 'Cancel', '막지 않고 끝까지 안내한다. 남은 기간과 오프라인 사본 만료 시점을 미리 말한다.', ['payment-charge', 'offline-cache']],

  ['usage-aggregate', 'royalty', '재생량 집계', 'Aggregate usage', '재생 기록을 권리자·기간별로 합친다. 30초 미만 재생을 세는지 같은 규칙이 계약마다 다르다.', ['play-log', 'track-rights']],
  ['royalty-calc', 'royalty', '정산 계산', 'Calculate royalties', '집계된 재생량을 계약 단가로 곱해 지급액을 만든다. 계산의 모든 입력이 재현 가능해야 감사를 통과한다.', ['usage-aggregate', 'artist-identity']],
  ['payout-run', 'royalty', '지급 실행', 'Run payouts', '계산된 금액을 실제로 보낸다. 한 번 보낸 것을 두 번 보내지 않는 것이 이 역량의 전부다.', ['royalty-calc']],
  ['royalty-audit', 'royalty', '정산 감사', 'Royalty audit', '권리자가 "왜 이 금액인가" 를 물으면 재생 한 건까지 되짚는다. 이 되짚기가 가능하다는 것이 계약 조건이다.', ['royalty-calc', 'usage-aggregate']],
  ['dispute-intake', 'royalty', '이의 접수', 'Dispute intake', '금액 이의를 받아 감사로 넘긴다. 접수한 것과 해소한 것의 차이가 곧 신뢰 지표다.', ['royalty-audit']],

  ['signin', 'account', '로그인', 'Sign in', '이메일·소셜·기기 코드. 어느 경로든 같은 계정에 도달해야 하고, 중복 계정이 생기면 정산과 취향이 갈라진다.', []],
  ['device-register', 'account', '기기 등록', 'Register a device', '동시 재생 수를 요금제 한도 안으로 묶는다. 한도를 넘으면 무엇을 끊을지 사용자가 고르게 한다.', ['signin', 'plan-catalog']],
  ['household-verify', 'account', '가구 확인', 'Verify a household', '가족 요금제가 실제 한 가구인지 본다. 위치를 저장하지 않고 확인하는 방법이 설계의 제약이다.', ['signin']],
  ['profile-switch', 'account', '프로필 전환', 'Switch profile', '한 계정 안의 여러 사람. 취향 프로필이 섞이지 않게 재생 기록도 함께 갈린다.', ['signin', 'taste-profile']],
];

/** Elements — [slug, domain, Korean, English, path, definition]. What actually implements a capability. */
const ELEMENTS = [
  ['audio-segmenter', 'playback', '오디오 분할기', 'Audio segmenter', 'services/playback/segmenter.ts', '원본 음원을 6초 세그먼트로 쪼개 여러 비트레이트로 굽는다.'],
  ['play-log-stream', 'playback', '재생 기록 스트림', 'Play log stream', 'services/playback/play-log-stream.ts', 'append-only 이벤트 스트림. 정산과 추천이 같은 원본을 읽는다.'],
  ['player-sdk', 'playback', '플레이어 SDK', 'Player SDK', 'packages/player-sdk/src/index.ts', '앱과 웹이 공유하는 재생 클라이언트. 버퍼링과 비트레이트 전환을 여기서 판단한다.'],
  ['drm-license', 'playback', 'DRM 라이선스', 'DRM license service', 'services/playback/drm-license.ts', '세그먼트를 풀 열쇠를 발급한다. 권리 확인이 통과해야만 발급된다.'],
  ['catalog-db', 'catalog', '카탈로그 저장소', 'Catalog store', 'services/catalog/store.ts', '트랙·앨범·아티스트와 그 권리 상태의 진실원.'],
  ['ingest-worker', 'catalog', '음원 수집기', 'Ingest worker', 'services/catalog/ingest-worker.ts', '배급사 전달본을 받아 검수하고 카탈로그에 올린다.'],
  ['rights-matrix', 'catalog', '권리 행렬', 'Rights matrix', 'services/catalog/rights-matrix.ts', '트랙 × 지역 × 기간의 허용 여부를 한 자료구조로 답한다.'],
  ['search-index', 'discovery', '검색 색인', 'Search index', 'services/discovery/search-index.ts', '오타와 다국어 표기를 견디는 색인. 색인 갱신 지연이 곧 "새 앨범이 안 뜬다" 다.'],
  ['taste-vectors', 'discovery', '취향 벡터', 'Taste vectors', 'services/discovery/taste-vectors.ts', '사람별 선호 벡터 저장소. 최근 가중치와 이상치 억제가 여기 산다.'],
  ['reco-ranker', 'discovery', '추천 순위기', 'Recommendation ranker', 'services/discovery/ranker.ts', '후보를 점수로 줄 세우고 다양성 제약을 적용한다.'],
  ['billing-gateway', 'subscription', '결제 게이트웨이', 'Billing gateway', 'services/subscription/billing-gateway.ts', '외부 결제사 어댑터. 재시도와 멱등키가 이 파일의 전부다.'],
  ['entitlement-cache', 'subscription', '권리 캐시', 'Entitlement cache', 'services/subscription/entitlement-cache.ts', '권리 판정을 짧게 캐시한다. 해지가 즉시 반영되도록 무효화 경로를 함께 둔다.'],
  ['plan-registry', 'subscription', '요금제 레지스트리', 'Plan registry', 'services/subscription/plan-registry.ts', '요금제가 허락하는 것의 단일 출처.'],
  ['usage-rollup-job', 'royalty', '집계 잡', 'Usage rollup job', 'jobs/royalty/usage-rollup.ts', '재생 기록을 권리자·기간으로 합치는 배치. 재실행이 같은 결과를 내야 한다.'],
  ['royalty-ledger', 'royalty', '정산 원장', 'Royalty ledger', 'services/royalty/ledger.ts', '계산과 지급의 append-only 원장. 감사가 여기만 읽으면 되도록.'],
  ['payout-adapter', 'royalty', '지급 어댑터', 'Payout adapter', 'services/royalty/payout-adapter.ts', '은행·송금사 연결. 중복 지급 방지 키가 핵심.'],
  ['identity-service', 'account', '인증 서비스', 'Identity service', 'services/account/identity.ts', '로그인 경로를 하나의 계정으로 수렴시킨다.'],
  ['device-registry', 'account', '기기 레지스트리', 'Device registry', 'services/account/device-registry.ts', '등록 기기와 동시 재생 수를 센다.'],
  ['household-signal', 'account', '가구 신호', 'Household signal', 'services/account/household-signal.ts', '위치를 저장하지 않고 같은 가구인지 추정한다.'],
];

const yaml = (lines) => `---\nuid: ${randomUUID()}\n${lines.filter(Boolean).join('\n')}\n---\n`;
/**
 * Graph arrays are written as a **canonical set** — sorted and deduplicated.
 * This is the rule the validator enforces as `non-canonical-graph-array`, and
 * skipping it makes a new vault born with 23 warnings (the first version was).
 * Warnings on the recording vault show up on the insights screen.
 */
const list = (key, items) => {
  const canonical = [...new Set(items.map((item) => item.trim()))].sort();
  return canonical.length ? `${key}:\n${canonical.map((item) => `  - ${item}`).join('\n')}` : null;
};

function write(rel, body) {
  const path = join(OUT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

write(
  'project.md',
  yaml([
    'slug: project',
    'kind: project',
    'title: 음악 스트리밍',
    'display_ko: 음악 스트리밍',
    'display_en: Music Streaming',
    list('domains', DOMAINS.map(([slug]) => slug)),
  ]) +
    `\n# 음악 스트리밍\n\n사람이 듣고, 그 들은 만큼 권리자에게 돌아가는 서비스다. 이 지도의 중심 사실은\n하나다 — **재생 기록**이 추천과 정산에 동시에 쓰인다. 그래서 재생 쪽을 건드리면\n돈과 취향이 함께 흔들린다.\n\n여섯 영역으로 나뉜다: 재생 · 카탈로그 · 추천 · 구독 · 정산 · 계정.\n`,
);

for (const [slug, ko, en, definition] of DOMAINS) {
  const caps = CAPABILITIES.filter(([, domain]) => domain === slug).map(([s]) => `capabilities/${s}`);
  const els = ELEMENTS.filter(([, domain]) => domain === slug).map(([s]) => `elements/${s}`);
  write(
    `domains/${slug}.md`,
    yaml([
      `slug: domains/${slug}`,
      'kind: domain',
      `title: ${ko}`,
      `display_ko: ${ko}`,
      `display_en: ${en}`,
      list('capabilities', caps),
      list('elements', els),
    ]) + `\n# ${ko}\n\n${definition}\n`,
  );
}

for (const [slug, domain, ko, en, definition, deps] of CAPABILITIES) {
  const els = ELEMENTS.filter(([, d]) => d === domain)
    .slice(0, 2)
    .map(([s]) => `elements/${s}`);
  write(
    `capabilities/${slug}.md`,
    yaml([
      `slug: capabilities/${slug}`,
      'kind: capability',
      `title: ${ko}`,
      `display_ko: ${ko}`,
      `display_en: ${en}`,
      `domain: ${domain}`,
      list('dependencies', deps.map((d) => `capabilities/${d}`)),
      list('elements', els),
    ]) + `\n# ${ko}\n\n${definition}\n`,
  );
}

for (const [slug, domain, ko, en, path, definition] of ELEMENTS) {
  write(
    `elements/${slug}.md`,
    yaml([
      `slug: elements/${slug}`,
      'kind: element',
      `title: ${ko}`,
      `display_ko: ${ko}`,
      `display_en: ${en}`,
      `domain: ${domain}`,
      `path: ${path}`,
    ]) + `\n# ${ko}\n\n${definition}\n`,
  );
}

// Its own git — never pollute this repository's `.git` (the ledger's recording gate).
execFileSync('git', ['init', '-q'], { cwd: OUT });
execFileSync('git', ['add', '-A'], { cwd: OUT });
execFileSync('git', ['-c', 'user.name=demo', '-c', 'user.email=demo@local', 'commit', '-q', '-m', 'chore: 음악 스트리밍 예시 볼트'], { cwd: OUT });

const count = 1 + DOMAINS.length + CAPABILITIES.length + ELEMENTS.length;
console.log(`[demo-vault] ${count} 노드 → ${OUT} (자체 git 초기화 완료)`);
