/**
 * The script `index.html` runs before first paint: it picks the language of the window from the path,
 * else the stored choice, else the system list (the order `detectLocale` answers in), marks the
 * installed app and the text size, and sends a plain browser at a language's root on to the download
 * page. It is written as text because it must run before any bundle loads, and CSP allows exactly this
 * one inline script (`script-src 'self'` plus its hash).
 */
export interface BootScriptOptions {
  /** Locale code to the `lang` value of `<html>` (`zh` is `zh-Hans`). */
  htmlLang: Readonly<Record<string, string>>;
  defaultLocale: string;
  storageKey: string;
}

export function buildBootScript({ htmlLang, defaultLocale, storageKey }: BootScriptOptions): string {
  const codes = Object.keys(htmlLang);
  return [
    'try{',
    'var d=document.documentElement;',
    `var m=${JSON.stringify(htmlLang)};`,
    'var has=function(k){return typeof k==="string"&&Object.prototype.hasOwnProperty.call(m,k);};',
    'var s=location.pathname.split("/");var c=null;',
    'for(var i=0;i<s.length;i++){if(has(s[i])){c=s[i];break;}}',
    `if(c===null){try{var t=localStorage.getItem(${JSON.stringify(storageKey)});if(has(t))c=t;}catch(e){}}`,
    'if(c===null){var l=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""];',
    'for(var j=0;j<l.length&&c===null;j++){var p=String(l[j]).toLowerCase().split("-");var h=p[0];',
    'if(h==="zh"){var hant=false;for(var k=1;k<p.length;k++){if(p[k]==="hant"||p[k]==="tw"||p[k]==="hk"||p[k]==="mo")hant=true;}if(!hant&&has("zh"))c="zh";}',
    'else if(has(h))c=h;}}',
    `d.lang=m[c===null?${JSON.stringify(defaultLocale)}:c];`,
    'try{var z=localStorage.getItem("atlas.appearance.text-size");if(z==="large"||z==="larger")d.setAttribute("data-text-size",z);}catch(e){}',
    'if(window.isTauri){d.setAttribute("data-shell","desktop");}',
    `else{var r=/\\/(${codes.join('|')})\\/?$/.exec(location.pathname);if(r)location.replace(location.pathname.slice(0,r.index)+"/"+r[1]+"/download/");}`,
    '}catch(e){}',
  ].join('');
}
