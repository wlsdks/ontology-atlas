const LANG_BOOT = [
  "try{",
  "var s=location.pathname.split('/');",
  "var m={en:'en',ko:'ko',ja:'ja',zh:'zh-Hans'};",
  "for(var i=0;i<s.length;i++){if(Object.prototype.hasOwnProperty.call(m,s[i])){document.documentElement.lang=m[s[i]];break;}}",
  "}catch(e){}",
].join("");

const TEXT_SIZE_BOOT = [
  "try{",
  "var t=localStorage.getItem('atlas.appearance.text-size');",
  "if(t==='large'||t==='larger'){document.documentElement.setAttribute('data-text-size',t);}",
  "}catch(e){}",
].join("");

// The installed app's runtime sets `window.isTauri` before any page script; the exported gateway frame
// stays invisible under this mark.
const SAMPLE_BOOT =
  "try{if(localStorage.getItem('demo:sample-source:v1')==='dogfood'){document.documentElement.setAttribute('data-sample','dogfood');}}catch(e){}";

const SHELL_BOOT = "try{if(window.isTauri){document.documentElement.setAttribute('data-shell','desktop');}}catch(e){}";

export function LangBootScript() {
  return <script async dangerouslySetInnerHTML={{ __html: LANG_BOOT + TEXT_SIZE_BOOT + SHELL_BOOT + SAMPLE_BOOT }} />;
}
