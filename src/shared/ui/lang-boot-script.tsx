const LANG_BOOT = [
  "try{",
  "var s=location.pathname.split('/');",
  "var m={en:'en',ko:'ko'};",
  "for(var i=0;i<s.length;i++){if(Object.prototype.hasOwnProperty.call(m,s[i])){document.documentElement.lang=m[s[i]];break;}}",
  "}catch(e){}",
].join("");

const TEXT_SIZE_BOOT = [
  "try{",
  "var t=localStorage.getItem('atlas.appearance.text-size');",
  "if(t==='large'||t==='larger'){document.documentElement.setAttribute('data-text-size',t);}",
  "}catch(e){}",
].join("");

export function LangBootScript() {
  return <script async dangerouslySetInnerHTML={{ __html: LANG_BOOT + TEXT_SIZE_BOOT }} />;
}
