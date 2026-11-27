import { useEffect } from 'react';

/**
 * The loading picture of `index.html` stays until a screen stands behind it, then goes in the same
 * commit, so no frame is blank. Focus a person put on it is handed to the screen's `#main`
 * (`stand-in-focus-handoff.ts`).
 */
export function BootPictureRemover() {
  useEffect(() => {
    document.getElementById('boot')?.remove();
  }, []);
  return null;
}
