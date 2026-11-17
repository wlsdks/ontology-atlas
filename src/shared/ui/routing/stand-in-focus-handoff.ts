const STAND_IN_SELECTOR = '#main[data-route-loading]';
const installed = new WeakSet<Document>();

/**
 * Focus a person puts on a loading stand-in's `#main` moves to the `#main` that replaces it.
 * Hydration swaps a static page's stand-in in the same commit that hydrates the shell, so this
 * starts at module load, before any effect could run, and watches the DOM only while a stand-in
 * holds focus.
 */
export function installStandInFocusHandoff(doc: Document | undefined = globalThis.document): void {
  if (!doc || installed.has(doc)) return;
  installed.add(doc);

  let focusedStandIn: Element | null = null;
  const observer = new MutationObserver(() => {
    if (!focusedStandIn || focusedStandIn.isConnected) return;
    const active = doc.activeElement;
    if (active && active !== doc.body && active !== doc.documentElement) {
      watch(active);
      return;
    }
    const replacement = doc.getElementById('main');
    if (!replacement) return;
    if (!replacement.hasAttribute('tabindex')) replacement.tabIndex = -1;
    replacement.focus({ preventScroll: true });
    watch(replacement);
  });

  function watch(target: EventTarget | null) {
    const standIn = target instanceof Element && target.matches(STAND_IN_SELECTOR) ? target : null;
    if (standIn === focusedStandIn) return;
    focusedStandIn = standIn;
    if (standIn) observer.observe(doc!.body, { childList: true, subtree: true });
    else observer.disconnect();
  }

  doc.addEventListener('focusin', (event) => watch(event.target), true);
  watch(doc.activeElement);
}
