import { gitHostPlatformFrom } from "@/shared/lib/git/git-install-guide";

/** Fills `{fileManager, select, ...}`: Finder on macOS, File Explorer on Windows, else generic. */
export type FileManager = "finder" | "explorer" | "other";

const FILE_MANAGER_BY_PLATFORM = { macos: "finder", windows: "explorer", linux: "other" } as const;

export function hostFileManager(): FileManager {
  if (typeof navigator === "undefined") return "other";
  return FILE_MANAGER_BY_PLATFORM[gitHostPlatformFrom(navigator.userAgent)];
}
