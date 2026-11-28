import { Suspense, use, useSyncExternalStore, type ReactNode } from "react";
import { useCommittedAddress } from "@/shared/lib/navigation/use-committed-address";
import { stripLocalePrefix } from "@/shared/lib/navigation/nav-destination";
import { isTauriVaultRuntime } from "@/shared/lib/vault-folder/native-vault/tauri-vault-runtime";
import { APP_ONLY_FACE_CLASS, workbenchFaceClass } from "./app-address-face-class";
import { OldBrowserFolderCleanup } from "./OldBrowserFolderCleanup";

/** A promise that never settles: a component that reads it keeps the server's HTML and never mounts. */
const NEVER_SETTLES = new Promise<never>(() => undefined);

const subscribeToRuntime = () => () => undefined;

/**
 * Whether this document still carries the page that says the app is needed. The server's HTML and the
 * first client render both carry it, so hydration matches; once hydrated, the installed app drops it
 * from the document, so its first `main`, `h1` and skip-link target are the workbench's own.
 */
function useAppOnlyFace(): boolean {
  return useSyncExternalStore(
    subscribeToRuntime,
    () => !isTauriVaultRuntime(),
    () => true,
  );
}

/**
 * An app address answers with two faces in one document: the app's screen and the page that says the
 * app is needed. The boot script marks the installed app on `<html>` before either is parsed, so CSS
 * alone paints the right one from the first frame, with or without scripts. A plain browser keeps
 * the app's screen as inert HTML: it never mounts, so it opens, reads and remembers no folder.
 *
 * The locale's root is the one address that is no app screen for a browser: it is the website's
 * entry, which a script in the document head sends on to the gateway before the body is parsed
 * (the boot script in `src/i18n/boot-script.ts`), so its own HTML stays visible and carries no second face.
 */
export function AppAddressFaces({ appOnly, children }: { appOnly: ReactNode; children: ReactNode }) {
  const atEntry = stripLocalePrefix(useCommittedAddress().pathname) === "/";
  const showAppOnly = useAppOnlyFace();
  return (
    <>
      <OldBrowserFolderCleanup />
      {atEntry || !showAppOnly ? null : (
        <div data-face="app-only" className={APP_ONLY_FACE_CLASS}>
          {appOnly}
        </div>
      )}
      <div data-face="workbench" className={workbenchFaceClass(atEntry)}>
        <Suspense fallback={null}>
          <InstalledAppOnly>{children}</InstalledAppOnly>
        </Suspense>
      </div>
    </>
  );
}

function InstalledAppOnly({ children }: { children: ReactNode }) {
  if (typeof window !== "undefined" && !isTauriVaultRuntime()) use(NEVER_SETTLES);
  return children;
}
