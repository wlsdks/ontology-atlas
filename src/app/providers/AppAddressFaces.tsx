"use client";

import { Suspense, use, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { withBasePath } from "@/shared/lib/public-pages/base-path";
import { stripLocalePrefix } from "@/shared/lib/navigation/nav-destination";
import { isTauriVaultRuntime } from "@/shared/lib/vault-folder/native-vault/tauri-vault-runtime";
import { OldBrowserFolderCleanup } from "./OldBrowserFolderCleanup";

/** A promise that never settles: a component that reads it keeps the server's HTML and never mounts. */
const NEVER_SETTLES = new Promise<never>(() => undefined);

/**
 * An app address answers with two faces in one document: the app's screen and the page that says the
 * app is needed. The boot script marks the installed app on `<html>` before either is parsed, so CSS
 * alone paints the right one from the first frame, with or without scripts. A plain browser keeps
 * the app's screen as inert HTML: it never mounts, so it opens, reads and remembers no folder.
 *
 * The locale's root is the one address that is no app screen for a browser: it is the website's
 * entry, so its HTML stays visible and a plain browser is sent on to the gateway.
 */
export function AppAddressFaces({
  locale,
  appOnly,
  children,
}: {
  locale: string;
  appOnly: ReactNode;
  children: ReactNode;
}) {
  const atEntry = stripLocalePrefix(usePathname() ?? "/") === "/";
  return (
    <>
      <OldBrowserFolderCleanup />
      {atEntry ? (
        <GatewayHandOver locale={locale} />
      ) : (
        <div data-face="app-only" className="flex min-h-full flex-1 flex-col [html[data-shell=desktop]_&]:hidden">
          {appOnly}
        </div>
      )}
      <div
        data-face="workbench"
        className={atEntry ? "contents" : "contents [html:not([data-shell=desktop])_&]:hidden"}
      >
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

function GatewayHandOver({ locale }: { locale: string }) {
  useEffect(() => {
    if (!isTauriVaultRuntime()) window.location.replace(withBasePath(`/${locale}/download/`));
  }, [locale]);
  return null;
}
