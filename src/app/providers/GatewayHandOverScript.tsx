import { routing } from "@/i18n/routing";

const LOCALES = routing.locales.join("|");

/**
 * The locale root, `/<locale>/`, is where the installed app starts and the website's entry for every
 * other browser. A browser is sent to `/<locale>/download/` here, in the document head, before the
 * body is parsed: no workbench document, catalog or folder code is fetched on the way, and the
 * pathname keeps whatever base path the site is served under. The installed app sets `window.isTauri`
 * before any page script, so it stays. Inline scripts are allowed by the site's content security policy.
 */
const HAND_OVER = [
  "try{",
  "if(!window.isTauri){",
  `var m=/\\/(${LOCALES})\\/?$/.exec(location.pathname);`,
  // A prefix that starts `//` would read as another site's address, so its leading slashes collapse to one.
  "if(m){location.replace(location.pathname.slice(0,m.index).replace(/^\\/+/,'/')+'/'+m[1]+'/download/');}",
  "}",
  "}catch(e){}",
].join("");

export function GatewayHandOverScript() {
  return <script dangerouslySetInnerHTML={{ __html: HAND_OVER }} />;
}
