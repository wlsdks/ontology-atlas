export function GroupHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {title}
      </h3>
      {meta ? (
        <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
          {meta}
        </p>
      ) : null}
    </div>
  );
}
