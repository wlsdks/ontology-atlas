/**
 * Applies the stored accent before the first paint; an effect would flash the default first.
 * Its own file because `tests/contract/json-ld-script-safety.contract.test.ts` keeps raw script
 * injection out of files using `JsonLd`. No data enters it: every string is a constant and the
 * body holds no `${`, which a contract asserts; a script that takes a value needs an escaping
 * boundary like `JsonLd`. The key and default belong to `appearance-preferences.ts`, held equal
 * by `tests/contract/accent-palette-switch.contract.test.ts`.
 */
const ACCENT_BOOT = [
  "try{",
  "var a=localStorage.getItem('ontology-atlas:accent:v1');",
  "if(a==='ember')document.documentElement.setAttribute('data-accent','ember');",
  "}catch(e){}",
].join("");

/**
 * Plants `<html lang>` from the first known-locale path segment before the first paint,
 * so `:lang(ko)` rules hold on the first frame (the root layout cannot know the locale). The
 * list is a constant held equal to `routing.locales`
 * by `tests/contract/hangul-word-keep.contract.test.ts`; `LocaleHtmlLang` handles client
 * switches.
 */
const LANG_BOOT = [
  "try{",
  "var s=location.pathname.split('/');",
  "for(var i=0;i<s.length;i++){if(s[i]==='en'||s[i]==='ko'){document.documentElement.lang=s[i];break;}}",
  "}catch(e){}",
].join("");

/**
 * Where an inline boot script lives is a contract: rendered raw under `<html>`, first in `<body>`
 * or in an explicit `<head>`, it warned, never ran on the client-rendered not-found route, or made
 * that route a 500. A dev-overlay badge turning an unrelated e2e gate red is the symptom.
 */
export function AccentBootScript() {
  /*
   * The `async` attribute is the marker that lets React 19 hoist this into the document; on an
   * inline script it does not defer, so this still runs synchronously before body content is
   * parsed.
   */
  return <script async dangerouslySetInnerHTML={{ __html: ACCENT_BOOT + LANG_BOOT }} />;
}
