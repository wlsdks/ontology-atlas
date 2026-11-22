export function DrawnCheck({
  size,
  drawn = true,
  settle = false,
  className = "",
}: {
  size: number;
  drawn?: boolean;
  settle?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-drawn={drawn ? "draw" : "static"}
      className={className}
    >
      <path
        d="M20 6 9 17l-5-5"
        pathLength={1}
        className={drawn ? (settle ? "motion-check-draw motion-check-draw-settle" : "motion-check-draw") : undefined}
      />
    </svg>
  );
}
