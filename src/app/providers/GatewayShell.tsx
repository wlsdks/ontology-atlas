import type { ReactNode } from "react";
import { ShellFrame, useShellSetup } from "./ShellFrame";

/** The viewport frame without the rail, map overlay, updater or agent dock, so no workbench code loads. */
export function GatewayShell({ children }: { children: ReactNode }) {
  useShellSetup();
  return <ShellFrame>{children}</ShellFrame>;
}
