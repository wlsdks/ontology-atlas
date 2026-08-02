/**
 * 첫 페이지 시연 클립 등록부 — **원장 시나리오를 데이터로 옮긴 것.**
 *
 * 원장: `docs/DECISIONS.md` 2026-07-29 「첫 페이지 시연 영상 시나리오: 2클립
 * 2탭 · 무컷 · 루프 없음 · 무음」 + 같은 날 밤 「시연 영상은 첫 페이지로 간다」.
 *
 * ## 왜 등록부가 따로 있나
 *
 * **촬영본이 없는 동안 이 절이 화면에 나오면 안 된다.** 재생할 것 없는 플레이어는
 * 죽은 UI 이고, 관문의 첫인상 자리에 죽은 UI 를 두는 것은 이 저장소가 「곧
 * 됩니다는 강등이 아니라 거짓말」이라고 못박은 것과 같은 결함이다
 * (`.claude/rules/surfaces.md`).
 *
 * ## 클립 A 의 이름이 바뀐 이유 (2026-07-30)
 *
 * 종전 id/라벨은 `agent-edits` · *"AI가 고치면 지도가 따라 바뀐다"* 였다. 소유자가
 * 클립 A 를 **기능 소개 투어**로 재정의하면서(*"클로드 코드에 연결된것까지 보여줄
 * 필요는 없어"*) 그 라벨이 **거짓**이 됐다 — 촬영본에 AI 가 고치는 장면이 없다.
 * 위 규율("라벨은 클립이 끝났을 때 관객이 갖게 될 문장")을 그대로 적용해
 * `one-folder` · *"폴더 하나가 여섯 화면으로 열린다"* 로 바꿨다. **찍은 것과 다른
 * 문장을 붙이는 것이 이 등록부가 막으려던 결함이다.**
 *
 * 그래서 자산의 존재 여부가 **데이터 한 곳**에서 결정된다. 파일이 붙기 전에는
 * `AVAILABLE` 이 비어 있고 절 자체가 렌더되지 않는다. 촬영본이 들어오면 아래
 * 배열에 한 줄을 더하는 것으로 켜진다 — 컴포넌트는 건드리지 않는다.
 *
 * ## 탭 라벨은 기능명이 아니다
 *
 * 원장 확정: 라벨은 *"클립이 끝났을 때 관객이 갖게 될 문장"* 이다. 「MCP 연결」
 * 같은 기능명은 이미 아는 사람에게만 읽히고, 이 자산의 1차 관객은 **에이전트를
 * 모르는 사람까지**다.
 */

/**
 * 한 클립의 계약. 전달 규격(원장 「촬영 후 게이트」)이 타입에 박혀 있다.
 *
 * ## 2026-08-03 개정 — 클립 **하나**, 자막 없음, 로케일별 영상
 *
 * 소유자 확정 셋:
 *
 * ① **둘에서 하나로.** 탭이 둘이면 관객은 «무엇을 볼지»를 먼저 골라야 하는데,
 *    첫인상 자리에서 그 선택은 비용이지 값이 아니다 — 대부분은 첫 탭만 보고
 *    떠나므로 두 번째 클립은 «만들었지만 아무도 안 보는 것»이 된다.
 * ② **자막을 굽지도 그리지도 않는다.** 로케일별 영상을 따로 찍으므로 자막이
 *    나를 정보가 없다. `.vtt` 배관을 남겨 두면 빈 트랙이 붙는다.
 * ③ **영상 자체가 로케일을 탄다** — 화면 안의 글자가 한국어/영어로 갈리기
 *    때문이다. 그래서 `basename` 이 아니라 `basenameFor(locale)` 이다.
 */
export interface DemoClip {
  id: 'atlas-tour';
  /** 초 단위 길이(실측). 촬영 후 게이트가 대조한다. */
  seconds: number;
  /** `public/demo/` 안의 파일 이름 앞부분 — 뒤에 `.ko` / `.en` 이 붙는다. */
  basename: string;
}

/**
 * 시나리오가 정한 두 클립. **선언은 항상 여기 있다** — 촬영 전에도 이 표가 있어야
 * 「무엇을 찍어야 하는가」가 코드에 남고, 촬영 후 게이트가 대조할 대상이 생긴다.
 */
export const DEMO_CLIPS: readonly DemoClip[] = [
  { id: 'atlas-tour', seconds: 45, basename: 'atlas-tour' },
];

/**
 * **실제로 붙은 촬영본.** 비어 있으면 시연 절이 렌더되지 않는다.
 *
 * 켜는 절차: `public/demo/<basename>.{webm,mp4}` + `<basename>-poster.png` +
 * `<basename>.ko.vtt` / `.en.vtt` 를 넣고, 그 id 를 여기 더한다. 파일만 넣고 이
 * 배열을 안 고치면 절은 계속 꺼져 있다 — **자산과 선언이 둘 다 있어야 켜진다**는
 * 것이 이 배열의 요점이다(파일 존재만으로 켜면, 반쯤 올라간 자산이 첫인상 자리에
 * 그대로 나간다).
 */
/*
 * 아직 비어 있다 — **새 시나리오의 촬영본이 없다.** 구 2클립 자산
 * (`one-folder` · `one-button`)은 지난 시나리오의 것이라 이 표의 대상이 아니다.
 * 재생할 것 없는 플레이어는 죽은 UI 이고, 관문의 첫인상 자리에 죽은 UI 를 두는
 * 것은 「곧 됩니다는 강등이 아니라 거짓말」과 같은 결함이다.
 *
 * 켜는 절차: `public/demo/atlas-tour.{ko,en}.{webm,mp4}` +
 * `atlas-tour.{ko,en}-poster.png` 를 넣고 여기에 `'atlas-tour'` 를 더한다.
 */
export const AVAILABLE_DEMO_CLIP_IDS: readonly DemoClip['id'][] = [];

/** 렌더할 클립 — 선언과 자산이 모두 있는 것만. */
export function availableDemoClips(
  available: readonly DemoClip['id'][] = AVAILABLE_DEMO_CLIP_IDS,
): readonly DemoClip[] {
  return DEMO_CLIPS.filter((clip) => available.includes(clip.id));
}

/** 시연 절을 그릴지 — 클립이 하나도 없으면 절 자체가 없다. */
export function hasDemoClips(
  available: readonly DemoClip['id'][] = AVAILABLE_DEMO_CLIP_IDS,
): boolean {
  return availableDemoClips(available).length > 0;
}

/**
 * 자산 경로. **AV1(webm) 를 먼저, MP4 를 최종 보루로** 둔다 — 원장: 이 페이지의 주
 * 방문자가 macOS(=Safari) 이고 Safari 의 AV1 은 하드웨어 지원에 따라 갈리므로
 * 떨어질 자리가 있어선 안 된다.
 */
function localeTag(locale: string): 'ko' | 'en' {
  return locale === 'ko' ? 'ko' : 'en';
}

export function demoSources(clip: DemoClip, locale: string): { src: string; type: string }[] {
  const base = `/demo/${clip.basename}.${localeTag(locale)}`;
  return [
    { src: `${base}.webm`, type: 'video/webm' },
    { src: `${base}.mp4`, type: 'video/mp4' },
  ];
}

export function demoPoster(clip: DemoClip, locale: string): string {
  return `/demo/${clip.basename}.${localeTag(locale)}-poster.png`;
}
