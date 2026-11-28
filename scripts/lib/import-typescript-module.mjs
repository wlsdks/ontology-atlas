/**
 * Imports a `.ts` file of the app from a plain `node` script: Node strips the types itself, so no
 * install is needed. The root package has no `"type"`, so Node says so on stderr the first time it
 * reads such a file; a script that prints nothing when its result is clean must not, and only that
 * one warning is held back. The file must import nothing that needs a resolver (no `@/` alias).
 */
let warningFiltered = false;

function holdBackTypelessPackageWarning() {
  if (warningFiltered) return;
  warningFiltered = true;
  const printers = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
    for (const print of printers) print(warning);
  });
}

/** @param {URL | string} location a `file:` URL, or a path relative to this folder's importer via `new URL` */
export function importTypeScriptModule(location) {
  holdBackTypelessPackageWarning();
  return import(String(location));
}
