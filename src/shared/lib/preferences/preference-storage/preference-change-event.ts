/**
 * One change event and one subscription shared by every appearance preference, read live by every
 * surface. A store, not a Context: the non-React canvas and DOM glyphs both need the live update.
 * SSR returns defaults so hydration cannot mismatch.
 */

const PREFERENCE_EVENT = "ontology-atlas:appearance-preference-change";

export function notifyPreferenceChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT));
}

export function subscribeToPreferenceChange(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PREFERENCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
