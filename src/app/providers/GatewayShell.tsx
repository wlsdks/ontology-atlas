"use client";

import type { ReactNode } from "react";
import { ShellFrame, useShellSetup } from "./ShellFrame";

/**
 * The gateway pages' shell (`app/(gateway)/[locale]/layout.tsx`): the workbench's viewport frame
 * without the rail, map overlay, updater or agent dock, none of which a gateway page shows. The
 * workbench `AppShell` hides its rail on these routes anyway (`isGatewaySurface`), so the page
 * draws as it did inside it, without loading the workbench or its copy.
 */
export function GatewayShell({ children }: { children: ReactNode }) {
  useShellSetup();
  return <ShellFrame>{children}</ShellFrame>;
}
