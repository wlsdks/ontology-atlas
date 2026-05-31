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
      aria-label={ariaLabel(count)}
      title={ariaLabel(count)}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3.5 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-[background-color,border-color] duration-180 ease-out hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none"
    >
      <GitCompare size={15} aria-hidden />
      <span>{label(count)}</span>
    </Link>
  );
}
