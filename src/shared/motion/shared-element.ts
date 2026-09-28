import { flushSync } from "react-dom";

const MORPH_ATTRIBUTE = "data-morph-name";
const MORPH_CLASS = "morph-transition";

interface MorphHandle {
  finished?: Promise<unknown>;
  ready?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
}

type StartViewTransition = (update: () => void) => MorphHandle | undefined;

function hashBase36(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function morphName(scope: "concept", key: string): string {
  return `morph-${scope}-${hashBase36(key)}`;
}

export function morphTargetProps(name: string): { [MORPH_ATTRIBUTE]: string } {
  return { [MORPH_ATTRIBUTE]: name };
}

function viewTransitionApi(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const candidate = (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  return typeof candidate === "function" ? (candidate as StartViewTransition).bind(document) : null;
}

function carrier(name: string, exclude: ReadonlySet<Element>): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[${MORPH_ATTRIBUTE}="${name}"]`)) {
    if (!exclude.has(element)) return element;
  }
  return null;
}

let generation = 0;

export function runMorph(update: () => void, names: readonly string[]): "transition" | "direct" {
  const start = viewTransitionApi();
  const sources = start
    ? names.flatMap((name) => {
      const element = carrier(name, new Set());
      return element ? [{ element, name }] : [];
    })
    : [];
  if (!start || sources.length === 0) {
    update();
    return "direct";
  }
  generation += 1;
  const own = generation;
  const root = document.documentElement;
  const named: HTMLElement[] = [];
  const nameElement = (element: HTMLElement, name: string) => {
    element.style.viewTransitionName = name;
    named.push(element);
  };
  const release = () => {
    for (const element of named) element.style.viewTransitionName = "";
    named.length = 0;
  };
  root.classList.add(MORPH_CLASS);
  for (const source of sources) nameElement(source.element, source.name);
  const sourceSet = new Set<Element>(sources.map((source) => source.element));
  const handle = start(() => {
    release();
    flushSync(update);
    for (const name of names) {
      const target = carrier(name, sourceSet);
      if (target) nameElement(target, name);
    }
  });
  const end = () => {
    release();
    if (own === generation) root.classList.remove(MORPH_CLASS);
  };
  for (const promise of [handle?.ready, handle?.updateCallbackDone]) {
    promise?.catch(() => undefined);
  }
  if (handle?.finished) handle.finished.then(end, end);
  else end();
  return "transition";
}
