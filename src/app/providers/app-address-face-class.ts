/** The app-only face is hidden under the installed app's `data-shell`; the workbench face is hidden everywhere else, except at the locale root. */
export const APP_ONLY_FACE_CLASS = "flex min-h-full flex-1 flex-col [html[data-shell=desktop]_&]:hidden";
export const workbenchFaceClass = (atEntry: boolean) =>
  atEntry ? "contents" : "contents [html:not([data-shell=desktop])_&]:hidden";
