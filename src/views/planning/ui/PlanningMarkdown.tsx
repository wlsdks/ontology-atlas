'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
const ImageRevision = createContext(0);

async function prepareImage(url: string): Promise<boolean> {
  const image = new Image();
  image.src = url;
  if (typeof image.decode !== 'function') return true;
  try { await image.decode(); return true; } catch { return false; }
}

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
  type ImageValue = { url: string; blob: Blob; pixels: number };
  type Entry = { revision: number; promise: Promise<ImageResult>; value: ImageValue | null };
  const cache = new Map<string, Entry>();
  const consumers = new Map<string, number>();
  const urls = new Set<string>();
  const waiting: (() => void)[] = [];
  let running = 0, total = 0, pixels = 0, reservedBytes = 0, reservedPixels = 0, users = 0, disposed = false;
  const pump = () => { while (!disposed && running < MAX_CONCURRENT && waiting.length) { running++; waiting.shift()?.(); } };
  const retire = (url: string) => {
    requestAnimationFrame(() => { if (urls.delete(url)) URL.revokeObjectURL(url); });
  };
  return {
    retain() { users++; },
    release() { users--; queueMicrotask(() => { if (users === 0) { disposed = true; waiting.splice(0).forEach((run) => { running++; run(); }); urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); } }); },
    retainPath(path: string) { consumers.set(path, (consumers.get(path) ?? 0) + 1); },
    releasePath(path: string) {
      consumers.set(path, (consumers.get(path) ?? 1) - 1);
      queueMicrotask(() => {
        if (consumers.get(path) !== 0) return;
        consumers.delete(path);
        const entry = cache.get(path);
        cache.delete(path);
        if (entry?.value) { total -= entry.value.blob.size; pixels -= entry.value.pixels; retire(entry.value.url); }
      });
    },
    load(path: string, revision: number): Promise<ImageResult> {
      const cached = cache.get(path);
      if (cached?.revision === revision) return cached.promise;
      let resolve!: (result: ImageResult) => void;
      const promise = new Promise<ImageResult>((finish) => { resolve = finish; });
      const entry: Entry = { revision, promise, value: cached?.value ?? null };
      cache.set(path, entry);
      const current = () => !disposed && cache.get(path) === entry;
      const removePrevious = () => {
        if (!entry.value) return;
        total -= entry.value.blob.size;
        pixels -= entry.value.pixels;
        retire(entry.value.url);
        entry.value = null;
      };
      waiting.push(() => {
        if (!current()) { resolve({ url: null, limited: false }); running--; pump(); return; }
        void (async (): Promise<ImageResult> => {
          const bytes = await read(path);
          if (!current()) return { url: null, limited: false };
          const info = planningImageInfo(path, bytes);
          if (!info) { removePrevious(); return { url: null, limited: false }; }
          const previous = entry.value;
          if (previous && previous.blob.size === bytes.length && typeof previous.blob.arrayBuffer === 'function') {
            const oldBytes = new Uint8Array(await previous.blob.arrayBuffer());
            if (!current()) return { url: null, limited: false };
            if (oldBytes.every((byte, index) => byte === bytes[index])) return { url: previous.url, limited: false };
          }
          const byteReservation = Math.max(0, bytes.length - (previous?.blob.size ?? 0));
          const pixelReservation = Math.max(0, info.pixels - (previous?.pixels ?? 0));
          if (total + reservedBytes + byteReservation > MAX_IMAGE_BYTES || pixels + reservedPixels + pixelReservation > MAX_IMAGE_PIXELS) {
            removePrevious();
            return { url: null, limited: true };
          }
          const blob = new Blob([new Uint8Array(bytes)], { type: info.mime });
          const url = URL.createObjectURL(blob);
          urls.add(url);
          reservedBytes += byteReservation;
          reservedPixels += pixelReservation;
          let ready: boolean;
          try { ready = await prepareImage(url); }
          catch { ready = false; }
          finally { reservedBytes -= byteReservation; reservedPixels -= pixelReservation; }
          if (!current() || !ready) {
            if (urls.delete(url)) URL.revokeObjectURL(url);
            if (current()) removePrevious();
            return { url: null, limited: false };
          }
          if (total - (previous?.blob.size ?? 0) + blob.size > MAX_IMAGE_BYTES || pixels - (previous?.pixels ?? 0) + info.pixels > MAX_IMAGE_PIXELS) {
            if (urls.delete(url)) URL.revokeObjectURL(url);
            removePrevious();
            return { url: null, limited: true };
          }
          removePrevious();
          total += blob.size;
          pixels += info.pixels;
          entry.value = { url, blob, pixels: info.pixels };
          return { url, limited: false };
        })().catch(() => { if (current()) removePrevious(); return { url: null, limited: false }; })
          .then(resolve).finally(() => { running--; pump(); });
      });
      pump();
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
  const revision = useContext(ImageRevision);
  const key = `${document}\0${src}`;
  const path = resolvePlanningImage(document, src);
  const supported = Boolean(path && /\.(?:png|jpe?g)$/i.test(path));
  const [result, setResult] = useState<(ImageResult & { key: string }) | null>(null);
  useEffect(() => {
    if (!path || !supported) return;
    resources.retainPath(path);
    return () => { resources.releasePath(path); };
  }, [path, supported, resources]);
  useEffect(() => {
    let active = true;
    if (!path || !supported) return;
    void resources.load(path, revision).then((value) => { if (active) setResult({ key, ...value }); });
    return () => { active = false; };
  }, [path, supported, key, resources, revision]);
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
    let active = true;
    if (!mime) {
      void Promise.resolve().then(() => { if (active) setUrl(null); });
      return () => { active = false; };
    }
    const next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
    void prepareImage(next).catch(() => false).then((ready) => {
      if (!active || !ready) { URL.revokeObjectURL(next); if (active) { setUrl(null); setFailed(true); } return; }
      setFailed(false);
      setUrl(next);
    });
    return () => { active = false; };
  }, [bytes, mime]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!/\.(?:png|jpe?g)$/i.test(path)) return <span role="status">{unsupported}</span>;
  if (!mime || failed) return <span role="status">{unavailable}</span>;
  if (!url) return <span role="status" data-planning-image-pending="true">{unavailable}</span>;
  return <ImageElement url={url} alt={alt} onError={() => setFailed(true)} />;
}

export function PlanningMarkdown({ document, text, readImage, imageUnavailable, unsupported, imageLimit, revision = 0 }: { document: string; text: string; readImage: ReadImage; imageUnavailable: string; unsupported: string; imageLimit: string; revision?: number }) {
  const resources = useMemo(() => imageResources(readImage), [readImage]);
  useEffect(() => { resources.retain(); return () => resources.release(); }, [resources]);
  const components = useMemo<Components>(() => ({
    a: ({ children }) => <span>{children}</span>,
    img: ({ src, alt }) => <LocalImage document={document} src={typeof src === 'string' ? src : ''} alt={alt ?? ''} unavailable={imageUnavailable} unsupported={unsupported} limited={imageLimit} resources={resources} />,
    table: ({ children }) => <div className="max-w-full overflow-x-auto"><table>{children}</table></div>,
  }), [document, imageUnavailable, unsupported, imageLimit, resources]);
  return <div className={`min-w-0 max-w-prose break-words ${MARKDOWN_PROSE_CLASS}`}><ImageRevision.Provider value={revision}><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, imageLimitPlugin(imageLimit)]} components={components}>{text}</ReactMarkdown></ImageRevision.Provider></div>;
}
