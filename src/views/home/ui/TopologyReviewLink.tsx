import { GitCompare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";

/**
 * Self-Drawing Diff #5 — 토폴로지 재진입 훅("자리 비운 사이").
 *
 * 토폴로지는 변경을 pulse 로 보여주지만 pulse 는 ~5s 뒤 사라져, 돌아온 사람에게
 * "아직 검토 안 한 변경이 N개" 라는 *지속* 단서가 없었다. baseline 영속(직전 커밋)
 * 이후 baseline 은 reload·세션을 넘어 살아남으므로, 기준 이후 변경 수 = "자리 비운
 * 사이 바뀐 것" 이다. 이 pill 이 그 수를 띄우고 /ontology(리뷰 surface)로 보낸다.
 *
 * #1 의 노드별 "리뷰함" 승인이 baseline 을 advance 하므로 이 수는 *미리뷰* 변경만
 * 센다 — 검토할수록 줄어드는 완료 루프(daily review habit). 변경 0 이면 렌더 안 함
 * (노이즈 0). 노드 변경(added+changed+removed)만 — 변경 패널 칩과 같은 셈법(엣지는
 * from-노드 시그니처로 접힘).
 */
export function TopologyReviewLink({
  changeset,
  label,
  ariaLabel,
}: {
  changeset: OntologyChangeset;
  label: (count: number) => string;
  ariaLabel: (count: number) => string;
}) {
  const count =
    changeset.addedNodes.length + changeset.changedNodes.length + changeset.removedNodes.length;
  if (count === 0) return null;
  return (
    <Link
      href="/ontology/"
      data-testid="topology-review-link"
      data-utility-action-token-contract="accent-surface-family"
      data-utility-action-surface-token="--topology-utility-lane-accent-surface"
      data-utility-action-border-token="--topology-utility-lane-accent-border"
      data-utility-action-shadow-token="--topology-utility-lane-shadow"
      data-utility-action-focus-ring-token="--topology-utility-lane-focus-ring"
      aria-label={ariaLabel(count)}
      title={ariaLabel(count)}
      // 높이/radius 는 ChromeChip 기준(44px·10px)으로 수렴 — 같은 우상단
      // 열의 "작업공간" 칩과 나란히 있어 --topology-utility-lane-height
      // (32~36px clamp) 를 쓰면 과도기 높이 불일치가 났다(feat/chrome-finish).
      //
      // ⚠️ 잉크는 `--color-indigo-text-soft`(accentOnTint) 다 (2026-08-15).
      // 종전 `--color-indigo-accent` 는 `accent-ink-contrast` 계약이
      // **맨 어두운 바탕에만** 라이선스한 잉크인데, 이 칩의 바탕은 인디고
      // 틴트다(`utility-lane-accent-surface` = rgba(94,106,210,.12)).
      // 실측: 쉬는 상태 canvas 4.73 / **panel 4.46(미달)**, 호버에서
      // 4.45 / 4.17 로 더 떨어졌다. soft 로 바꾸면 8.71 / 8.21.
      //
      // 그 계약이 이 자리를 못 본 이유는 틴트 이름이 `--topology-*` 별칭이라
      // 그 소스 스캔의 정규식(`--color-(indigo|amber)…-a\d+`)에 안 걸려서다.
      className="inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--topology-utility-lane-accent-border)] bg-[color:var(--topology-utility-lane-accent-surface)] px-3.5 text-[length:var(--topology-chrome-title-size)] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] shadow-[var(--topology-utility-lane-shadow)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-[color:var(--topology-utility-lane-accent-hover-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-utility-lane-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none"
    >
      <GitCompare className="size-[var(--topology-chrome-icon-size)]" aria-hidden />
      <span>{label(count)}</span>
    </Link>
  );
}
