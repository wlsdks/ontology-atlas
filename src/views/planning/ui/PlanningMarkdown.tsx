'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
type Observation = { revision: number; status: 'checking' | 'ready' | 'unavailable'; checking: string; unconfirmed: string; checked: string; attention: (name: string) => string; recovered: (name: string) => string; blocked: (name: string, reason: string) => string; unnamed: (line: number, column: number) => string };
const defaultObservation: Observation = { revision: 0, status: 'ready', checking: 'Checking image…', unconfirmed: 'Image not confirmed', checked: 'Image checked', attention: (name) => `Image needs attention: ${name}`, recovered: (name) => `Image recovered: ${name}`, blocked: (name, reason) => `${name}: ${reason}`, unnamed: (line, column) => `Image ${line}:${column}` };
const ImageRevision = createContext<Observation>(defaultObservation);

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
  type Entry = { revision: number; wanted: number; promise: Promise<ImageResult>; value: ImageValue | null };
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
    markWanted(path: string, revision: number) { const entry = cache.get(path); if (entry) entry.wanted = Math.max(entry.wanted, revision); },
    load(path: string, revision: number): Promise<ImageResult> {
      const cached = cache.get(path);
      if (cached?.revision === revision) return cached.promise;
      let resolve!: (result: ImageResult) => void;
      const promise = new Promise<ImageResult>((finish) => { resolve = finish; });
      const entry: Entry = { revision, wanted: revision, promise, value: cached?.value ?? null };
      cache.set(path, entry);
      const current = () => !disposed && cache.get(path) === entry && entry.wanted === entry.revision;
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
function imageDisplayName(src: string, alt: string, fallback: string): string {
  const clean = (value: string) => Array.from(value.replace(/\s+/gu, ' ').trim()).slice(0, 120).join('');
  const fromAlt = clean(alt);
  if (fromAlt && !/(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|\?\S+|(?:\S*[/.]\S*|\blocalhost)#\S+|&[^=\s]+=[^\s]*|\b(?:token|password|secret|authorization|api[_-]?key)\s*[:=]|\b[^\s:@]+:[^\s@]+@)/i.test(fromAlt)) return fromAlt;
  const reference = src.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\\)/i.test(reference) || /%[0-9a-f]{2}/i.test(reference)) return fallback;
  const path = reference.split(/[?#]/u, 1)[0];
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name && name !== '.' && name !== '..' ? clean(name) || fallback : fallback;
}
type ImageLoad = { desired: number; running: boolean; stopped: boolean; kick: () => void };
function ImageStatus({ state, pending, hidden, failure, success, attention, recovered }: { state: string; pending: boolean; hidden: boolean; failure: boolean; success: boolean; attention: string; recovered: string }) {
  const [announcement, setAnnouncement] = useState('');
  const announcedFailure = useRef(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (failure && !announcedFailure.current) { announcedFailure.current = true; setAnnouncement(attention); }
      else if (success && announcedFailure.current) { announcedFailure.current = false; setAnnouncement(recovered); }
    });
    return () => { active = false; };
  }, [failure, success, attention, recovered]);
  return <><span aria-live="off" data-planning-image-state data-planning-image-pending={pending ? 'true' : undefined} className={hidden ? 'sr-only' : 'text-body text-[color:var(--color-text-secondary)]'}>{state}</span><span role="status" data-planning-image-alert className="sr-only">{announcement}</span></>;
}

function LocalImage({ document, src, alt, line, column, unavailable, unsupported, limited, resources }: { document: string; src: string; alt: string; line: number; column: number; unavailable: string; unsupported: string; limited: string; resources: Resources }) {
  const observation = useContext(ImageRevision);
  const { revision, status, checking, unconfirmed, checked } = observation;
  const key = `${document}\0${src}`;
  const path = resolvePlanningImage(document, src);
  const supported = Boolean(path && /\.(?:png|jpe?g)$/i.test(path));
  const [result, setResult] = useState<(ImageResult & { key: string; revision: number }) | null>(null);
  const load = useRef<ImageLoad | null>(null);
  useEffect(() => {
    if (!path || !supported) return;
    resources.retainPath(path);
    const state: ImageLoad = { desired: 0, running: false, stopped: false, kick: () => {} };
    state.kick = () => {
      if (state.running || state.stopped) return;
      const target = state.desired;
      state.running = true;
      void resources.load(path, target).then((value) => {
        state.running = false;
        if (state.stopped) return;
        if (state.desired !== target) { state.kick(); return; }
        setResult({ key, revision: target, ...value });
      });
    };
    load.current = state;
    return () => { state.stopped = true; if (load.current === state) load.current = null; resources.releasePath(path); };
  }, [path, supported, key, resources]);
  useEffect(() => {
    const state = load.current;
    if (!state || !path) return;
    state.desired = revision;
    resources.markWanted(path, revision);
    state.kick();
  }, [revision, path, supported, key, resources]);
  const name = imageDisplayName(src, alt, observation.unnamed(line, column));
  if (!path || !supported) {
    const label = observation.blocked(name, path ? unsupported : unavailable);
    return <span className="inline-flex max-w-full flex-col gap-1 pr-2 align-top"><ImageStatus key={`${key}\0${name}`} state={label} pending={false} hidden={false} failure success={false} attention={label} recovered={observation.recovered(name)} /></span>;
  }
  const current = result?.key === key ? result : null;
  const pending = status === 'checking' || (status === 'ready' && current?.revision !== revision);
  const label = status === 'unavailable' ? unconfirmed : pending ? checking : current?.url ? checked : observation.blocked(name, current?.limited ? limited : unavailable);
  const displayed = current?.url;
  return <span className="inline-flex max-w-full flex-col gap-1 pr-2 align-top">{displayed && <ImageElement url={displayed} alt={alt.trim() ? name : ''} onError={() => setResult((previous) => previous?.url === displayed ? { ...previous, url: null, limited: false } : previous)} />}<ImageStatus key={key} state={label} pending={pending} hidden={status === 'ready' && !pending && Boolean(displayed)} failure={status === 'ready' && !pending && !displayed} success={status === 'ready' && !pending && Boolean(displayed)} attention={observation.attention(name)} recovered={observation.recovered(name)} /></span>;
}

export function PlanningStandaloneImage({ path, bytes, alt, unavailable, unsupported, observation }: { path: string; bytes: Uint8Array; alt: string; unavailable: string; unsupported: string; observation: Observation }) {
  const [display, setDisplay] = useState<{ url: string; bytes: Uint8Array } | null>(null);
  const [failure, setFailure] = useState<{ bytes: Uint8Array; revision: number } | null>(null);
  const mime = boundedPlanningImage(path, bytes);
  const decoder = useRef<{ desired: { bytes: Uint8Array; mime: string | null; revision: number }; pending: string | null; running: boolean; stopped: boolean; kick: () => void } | null>(null);
  useEffect(() => {
    const state: NonNullable<typeof decoder.current> = { desired: { bytes: new Uint8Array(), mime: null, revision: 0 }, pending: null, running: false, stopped: false, kick: () => {} };
    state.kick = () => {
      if (state.running || state.stopped || !state.desired.mime) return;
      const target = state.desired;
      const next = URL.createObjectURL(new Blob([new Uint8Array(target.bytes)], { type: target.mime! }));
      state.pending = next;
      state.running = true;
      void prepareImage(next).catch(() => false).then((ready) => {
        state.running = false;
        if (state.pending === next) { state.pending = null; if (state.stopped || state.desired !== target || !ready) URL.revokeObjectURL(next); }
        if (state.stopped) return;
        if (state.desired !== target) { state.kick(); return; }
        if (!ready) { setFailure({ bytes: target.bytes, revision: target.revision }); return; }
        setFailure(null);
        setDisplay({ url: next, bytes: target.bytes });
      });
    };
    decoder.current = state;
    return () => { state.stopped = true; if (state.pending) { URL.revokeObjectURL(state.pending); state.pending = null; } if (decoder.current === state) decoder.current = null; };
  }, [path]);
  useEffect(() => {
    const state = decoder.current;
    if (!state) return;
    if (failure?.bytes === bytes && failure.revision === observation.revision) return;
    if (display?.bytes === bytes && failure?.bytes !== bytes) return;
    if (state.running && state.desired.bytes === bytes && failure?.bytes !== bytes) return;
    state.desired = { bytes, mime, revision: observation.revision };
    state.kick();
  }, [path, bytes, mime, observation.revision, failure, display]);
  useEffect(() => () => { if (display) URL.revokeObjectURL(display.url); }, [display]);
  const name = imageDisplayName(path, alt, observation.unnamed(1, 1));
  if (!/\.(?:png|jpe?g)$/i.test(path)) {
    const label = observation.blocked(name, unsupported);
    return <span className="inline-flex max-w-full flex-col gap-1 align-top"><ImageStatus key={`${path}\0${name}`} state={label} pending={false} hidden={false} failure success={false} attention={label} recovered={observation.recovered(name)} /></span>;
  }
  const failed = !mime || failure?.bytes === bytes;
  const retrying = failure?.bytes === bytes && failure.revision !== observation.revision;
  const pending = observation.status === 'checking' || (observation.status === 'ready' && (retrying || (!failed && display?.bytes !== bytes)));
  const label = observation.status === 'unavailable' ? observation.unconfirmed : pending ? observation.checking : failed ? observation.blocked(name, unavailable) : observation.checked;
  const displayed = !failed ? display : null;
  return <span className="inline-flex max-w-full flex-col gap-1 align-top">{displayed && <ImageElement url={displayed.url} alt={alt.trim() ? name : ''} onError={() => setFailure({ bytes: displayed.bytes, revision: observation.revision })} />}<ImageStatus key={path} state={label} pending={pending} hidden={observation.status === 'ready' && !pending && Boolean(displayed)} failure={observation.status === 'ready' && !pending && failed} success={observation.status === 'ready' && !pending && Boolean(displayed)} attention={observation.attention(name)} recovered={observation.recovered(name)} /></span>;
}

export function PlanningMarkdown({ document, text, readImage, imageUnavailable, unsupported, imageLimit, revision = 0, observation }: { document: string; text: string; readImage: ReadImage; imageUnavailable: string; unsupported: string; imageLimit: string; revision?: number; observation?: Observation }) {
  const resources = useMemo(() => imageResources(readImage), [readImage]);
  useEffect(() => { resources.retain(); return () => resources.release(); }, [resources]);
  const components = useMemo<Components>(() => ({
    a: ({ children }) => <span>{children}</span>,
    img: ({ src, alt, node }) => <LocalImage document={document} src={typeof src === 'string' ? src : ''} alt={alt ?? ''} line={node?.position?.start.line ?? 1} column={node?.position?.start.column ?? 1} unavailable={imageUnavailable} unsupported={unsupported} limited={imageLimit} resources={resources} />,
    table: ({ children }) => <div className="max-w-full overflow-x-auto"><table>{children}</table></div>,
  }), [document, imageUnavailable, unsupported, imageLimit, resources]);
  return <div className={`min-w-0 max-w-prose break-words ${MARKDOWN_PROSE_CLASS}`}><ImageRevision.Provider value={observation ?? { ...defaultObservation, revision }}><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, imageLimitPlugin(imageLimit)]} components={components}>{text}</ReactMarkdown></ImageRevision.Provider></div>;
}
