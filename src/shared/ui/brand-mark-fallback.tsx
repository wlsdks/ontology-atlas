/**
 * BrandMarkFallback — 후보 A "헥사 별자리" compact 형(헥사곤 스트로크 + 중심
 * 앰버 도트), `docs/prototypes/app-icon-concepts.html` 소유자 최종 승인.
 * 임시 구현 — `@/shared/ui/brand-mark` (별도 에이전트가 작업 중, props: size ·
 * detail "full"|"compact")가 배선되면 이 컴포넌트의 두 소비처(좌측 내비
 * 레일 로고 20px · 브랜드 필 pip 15px, 둘 다 `detail="compact"` 상당)를
 * `<BrandMark size={..} detail="compact" />` 로 교체하고 이 파일은 삭제한다.
 *
 * 구 단순 헥사곤(외곽선만, 중심 도트 없음)은 후보에서 탈락했으므로 절대
 * 재도입하지 않는다 — 반드시 중심 앰버 도트를 포함한 이 형태만 쓴다.
 */
export function BrandMarkFallback({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M24 7 L38.7 15.5 L38.7 32.5 L24 41 L9.3 32.5 L9.3 15.5 Z"
        fill="none"
        stroke="rgba(139,151,255,.75)"
        strokeWidth={2.6}
      />
      <circle cx={24} cy={24} r={5.5} fill="var(--topology-v2-amber-hub)" />
    </svg>
  );
}
