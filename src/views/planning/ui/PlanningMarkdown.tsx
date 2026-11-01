'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { boundedPlanningImage, planningImageInfo, resolvePlanningImage } from '@/shared/lib/planning/image-path';
import { MARKDOWN_PROSE_CLASS } from '@/shared/ui/tokens/markdown-prose';

type ReadImage = (path: string) => Promise<Uint8Array>;
type ImageResult = { url: string | null; limited: boolean };
const MAX_IMAGES = 64;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_777_216;
const MAX_CONCURRENT = 3;

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };
function imageLimitPlugin(message: string) {
  return () => (tree: MarkdownNode) => {
    let count = 0;
    const visit = (node: MarkdownNode) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if ((child.type === 'image' || child.type === 'imageReference') && ++count > MAX_IMAGES) return { type: 'text', value: message };
        visit(child);
        return child;
      });
    };
    visit(tree);
  };
}
function imageResources(read: ReadImage) {
  const cache = new Map<string, Promise<ImageResult>>();
  const urls = new Set<string>();
  const waiting: (() => void)[] = [];
  let running = 0, total = 0, pixels = 0, users = 0, disposed = false;
  const pump = () => { while (!disposed && running < MAX_CONCURRENT && waiting.length) { running++; waiting.shift()?.(); } };
  return {
    retain() { users++; },
    release() { users--; queueMicrotask(() => { if (users === 0) { disposed = true; waiting.splice(0).forEach((run) => run()); urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); } }); },
    load(path: string): Promise<ImageResult> {
      const cached = cache.get(path);
      if (cached) return cached;
      const promise = new Promise<ImageResult>((resolve) => {
        waiting.push(() => {
          if (disposed) { resolve({ url: null, limited: true }); return; }
          void read(path).then((bytes) => {
            const info = planningImageInfo(path, bytes);
            if (disposed || !info) return { url: null, limited: false };
            if (total + bytes.length > MAX_IMAGE_BYTES || pixels + info.pixels > MAX_IMAGE_PIXELS) return { url: null, limited: true };
            total += bytes.length;
            pixels += info.pixels;
            const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: info.mime }));
            urls.add(url);
            return { url, limited: false };
          }).catch(() => ({ url: null, limited: false })).then(resolve).finally(() => { running--; pump(); });
        });
        pump();
      });
      cache.set(path, promise);
      return promise;
    },
  };
}
type Resources = ReturnType<typeof imageResources>;
function ImageElement({ url, alt, onError }: { url: string; alt: string; onError: () => void }) {
  // eslint-disable-next-line @next/next/no-img-element -- local Blob URLs cannot use Next optimization.
  return <img src={url} alt={alt} className="h-auto max-w-full rounded-card" onError={onError} />;
}
function LocalImage({ document, src, alt, unavailable, unsupported, limited, resources }: { document: string; src: string; alt: string; unavailable: string; unsupported: string; limited: string; resources: Resources }) {
  const key = `${document}\0${src}`;
  const path = resolvePlanningImage(document, src);
  const supported = Boolean(path && /\.(?:png|jpe?g)$/i.test(path));
  const [result, setResult] = useState<(ImageResult & { key: string }) | null>(null);
  useEffect(() => {
    let active = true;
    if (!path || !supported) return;
    void resources.load(path).then((value) => { if (active) setResult({ key, ...value }); });
    return () => { active = false; };
  }, [path, supported, key, resources]);
  if (!path) return <span role="status">{unavailable}</span>;
  if (!supported) return <span role="status">{unsupported}</span>;
  if (result?.key !== key) return <span role="status" data-planning-image-pending="true">{unavailable}</span>;
  if (!result.url) return <span role="status">{result.limited ? limited : unavailable}</span>;
  return <ImageElement url={result.url} alt={alt} onError={() => setResult({ key, url: null, limited: false })} />;
}

export function PlanningStandaloneImage({ path, bytes, alt, unavailable, unsupported }: { path: string; bytes: Uint8Array; alt: string; unavailable: string; unsupported: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mime = boundedPlanningImage(path, bytes);
  useEffect(() => {
    if (!mime) return;
    let active = true;
    let next: string | null = null;
    void Promise.resolve().then(() => {
      if (!active) return;
      next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
      setUrl(next);
    });
    return () => { active = false; if (next) URL.revokeObjectURL(next); };
  }, [bytes, mime]);
  if (!/\.(?:png|jpe?g)$/i.test(path)) return <span role="status">{unsupported}</span>;
  if (!mime || failed) return <span role="status">{unavailable}</span>;
  if (!url) return <span role="status" data-planning-image-pending="true">{unavailable}</span>;
  return <ImageElement url={url} alt={alt} onError={() => setFailed(true)} />;
}

export function PlanningMarkdown({ document, text, readImage, imageUnavailable, unsupported, imageLimit }: { document: string; text: string; readImage: ReadImage; imageUnavailable: string; unsupported: string; imageLimit: string }) {
  const resources = useMemo(() => imageResources(readImage), [readImage]);
  useEffect(() => { resources.retain(); return () => resources.release(); }, [resources]);
  const components = useMemo<Components>(() => ({
    a: ({ children }) => <span>{children}</span>,
    img: ({ src, alt }) => <LocalImage document={document} src={typeof src === 'string' ? src : ''} alt={alt ?? ''} unavailable={imageUnavailable} unsupported={unsupported} limited={imageLimit} resources={resources} />,
    table: ({ children }) => <div className="max-w-full overflow-x-auto"><table>{children}</table></div>,
  }), [document, imageUnavailable, unsupported, imageLimit, resources]);
  return <div className={`min-w-0 max-w-prose break-words ${MARKDOWN_PROSE_CLASS}`}><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, imageLimitPlugin(imageLimit)]} components={components}>{text}</ReactMarkdown></div>;
}
