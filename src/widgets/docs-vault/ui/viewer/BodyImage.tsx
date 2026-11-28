export function BodyImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      width={1200}
      height={800}
      loading="lazy"
      decoding="async"
      className="my-4 max-w-full rounded-chip border border-[color:var(--color-border-soft)]"
      style={{ height: 'auto' }}
      title={title}
    />
  );
}
