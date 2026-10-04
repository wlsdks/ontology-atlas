import { useLayoutEffect, useState, type RefObject } from 'react';

export function useStructureFrame(ref: RefObject<HTMLElement | null>, content: RefObject<HTMLDivElement | null>, scope: string, inspectorOpen: boolean, indexExpanded: boolean) {
  const [frame, setFrame] = useState<{ left: number; right: number; top: number } | null>(null);
  const [links, setLinks] = useState<{ kind: string; d: string }[]>([]);
  useLayoutEffect(() => {
    const section = ref.current;
    const inner = content.current;
    if (!section || !inner) return;
    const toolbar = document.querySelector<HTMLElement>('[data-testid="topology-top-toolbar"]');
    const host = section.parentElement;
    if (!host || !toolbar) return;
    const measure = () => {
      const style = getComputedStyle(section);
      const inset = parseFloat(style.getPropertyValue('--chrome-inset'));
      const guide = parseFloat(style.getPropertyValue('--topology-index-tab-width'));
      const panel = document.querySelector<HTMLElement>('[data-testid="map-detail-panel"]');
      const hostRect = host.getBoundingClientRect();
      const toolbarStyle = getComputedStyle(toolbar);
      const scale = toolbarStyle.transform === "none" ? 1 : new DOMMatrix(toolbarStyle.transform).d;
      const zoom = parseFloat(toolbarStyle.zoom) || 1;
      const left = toolbar.offsetLeft * zoom;
      const right = inspectorOpen && panel && matchMedia('(min-width: 768px)').matches ? hostRect.right - panel.getBoundingClientRect().left + inset : (inset + guide) * zoom;
      const next = { left: left - guide, right: right - guide, top: (toolbar.offsetTop + toolbar.offsetHeight * scale) * zoom + inset };
      setFrame(previous => previous && Object.keys(next).every(key => Math.abs(previous[key as keyof typeof next] - next[key as keyof typeof next]) < 0.5) ? previous : next);
      const source = inner.querySelector<HTMLElement>('[data-structure-parent-anchor]');
      if (!source) { setLinks(previous => previous.length ? [] : previous); return; }
      const box = inner.getBoundingClientRect();
      const from = source.getBoundingClientRect();
      const x = from.left + from.width / 2 - box.left;
      const y = from.bottom - box.top;
      const lane = inset / 2;
      const paths = [...inner.querySelectorAll<HTMLElement>('[data-structure-kind-anchor]')].map(target => {
        const to = target.getBoundingClientRect();
        const tx = to.left + to.width / 2 - box.left;
        const ty = to.top + to.height / 2 - box.top;
        return { kind: target.dataset.structureKindAnchor!, d: `M ${x} ${y} Q ${x} ${y + lane} ${lane} ${y + lane} L ${lane} ${ty - lane} Q ${lane} ${ty} ${tx} ${ty}` };
      });
      setLinks(previous => JSON.stringify(previous) === JSON.stringify(paths) ? previous : paths);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    observer.observe(inner);
    observer.observe(host);
    return () => observer.disconnect();
  }, [ref, content, scope, inspectorOpen, indexExpanded]);
  return { frame, links };
}
