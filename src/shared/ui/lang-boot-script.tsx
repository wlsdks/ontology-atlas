const LANG_BOOT = [
  "try{",
  "var s=location.pathname.split('/');",
  "for(var i=0;i<s.length;i++){if(s[i]==='en'||s[i]==='ko'){document.documentElement.lang=s[i];break;}}",
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
