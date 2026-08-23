/**
 * The **single source for the external links** the gateway chrome renders.
 *
 * Owner instruction (2026-07-30): *"Build the X slot now, I'll
 * supply the link later — just disable it, but keep it visible."*
 *
 * So **the slot renders, but with no destination it is not a link.** An empty
 * value makes the chrome render it disabled, and filling in the handle turns it
 * into a real link without touching the component.
 *
 * **Is rendering it disabled a dead CTA?** A dead CTA **looks pressable and goes
 * nowhere**. This is the opposite: it looks unpressable, and `aria-disabled` plus
 * a tooltip say why. Web smoke ③ blocks the "promised but no destination" case,
 * and this promises nothing.
 *
 * ⚠️ **Do not use a disabled slot as a workaround for "coming soon".** This repo
 * has recorded that "coming soon" is a lie rather than a degradation. This entry
 * is legitimate because the account **really exists** and the owner had simply
 * not handed over the URL yet. Pre-rendering a slot for a channel that does not
 * exist would make the same pattern a lie.
 */

/**
 * The X (formerly Twitter) handle, without the `@`. Empty renders disabled.
 *
 * Write only the handle (e.g. `'ontologyatlas'`), never a full URL, so another
 * domain change (twitter.com → x.com) does not shake this file.
 *
 * **The owner supplied it on 2026-08-08** (`https://x.com/stark9777`), so the
 * "disabled" section above now describes what happens if this value is cleared;
 * on screen it is a real link, and the component was never touched. Filling it in
 * also closed the hierarchy seat's 2026-08-08 finding (*a disabled mark with no
 * destination advertises on our own face that the account does not exist*) — that
 * finding targeted **the empty destination**, not the slot.
 */
export const X_HANDLE = 'stark9777';

/** The real destination when a handle exists; `null` otherwise. */
export function xProfileUrl(): string | null {
  return X_HANDLE ? `https://x.com/${X_HANDLE}` : null;
}

/** This repo's public URL — the chrome and the gateway share this value. */
export const GITHUB_REPO_URL = 'https://github.com/wlsdks/ontology-atlas';
