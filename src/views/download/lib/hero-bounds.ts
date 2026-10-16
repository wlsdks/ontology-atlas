const GAP_PX = 8;
const CAPTION_GAP_PX = 24;
const GUTTER_PX = 48;

function offsetWithin(element: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = element; node && node !== ancestor; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y };
}

export interface HeroBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface HeroType {
  section: HTMLElement;
  facts: HTMLElement;
  head: HTMLElement;
  ink: HTMLElement[];
}

function heroType(stage: HTMLElement): HeroType | null {
  const section = stage.closest('section');
  const facts = section?.querySelector<HTMLElement>('[data-testid="gateway-facts"]');
  const text = section?.querySelector<HTMLElement>('[data-hero-text]');
  const h1 = section?.querySelector('h1');
  const head = h1?.parentElement;
  if (!section || !facts || !text || !h1 || !head) return null;
  return { section, facts, head, ink: [h1, ...(text.children as HTMLCollectionOf<HTMLElement>)] };
}

/** Line boxes for text, border boxes for the controls: the ink, not the column the copy may fill. */
function inkRight(ink: readonly HTMLElement[], originX: number): number {
  const range = document.createRange();
  let right = 0;
  for (const element of ink) {
    range.selectNodeContents(element);
    for (const rect of range.getClientRects()) {
      if (rect.width > 0) right = Math.max(right, rect.right - originX);
    }
  }
  return right;
}

export function heroBounds(stage: HTMLElement, caption: HTMLElement | null): HeroBox | null {
  const type = heroType(stage);
  if (!type || !caption) return null;
  const { section, facts, head, ink } = type;
  const captionTop = offsetWithin(facts, section).y - CAPTION_GAP_PX - caption.offsetHeight;
  caption.style.top = `${captionTop}px`;
  caption.style.bottom = 'auto';
  return {
    left: inkRight(ink, section.getBoundingClientRect().left) + GUTTER_PX,
    right: section.clientWidth - Number.parseFloat(getComputedStyle(section).paddingRight),
    top: offsetWithin(head, section).y + Number.parseFloat(getComputedStyle(head).paddingTop),
    bottom: captionTop - GAP_PX,
  };
}

const boxKey = (box: HeroBox | null): string => (box ? `${box.left} ${box.right} ${box.top} ${box.bottom}` : '');

/** For a reflow the stage does not see: a late font, a wrapped control. */
export function watchHeroType(stage: HTMLElement, caption: HTMLElement | null, refit: () => void): () => void {
  const type = heroType(stage);
  if (!type || typeof ResizeObserver !== 'function') return () => {};
  let key = boxKey(heroBounds(stage, caption));
  const observer = new ResizeObserver(() => {
    const next = boxKey(heroBounds(stage, caption));
    if (next === key) return;
    key = next;
    refit();
  });
  for (const element of type.ink) {
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
  }
  return () => observer.disconnect();
}

export function releaseCaption(caption: HTMLElement | null): void {
  caption?.style.removeProperty('top');
  caption?.style.removeProperty('bottom');
}
