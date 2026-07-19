import { loadMacosReleaseNames } from "../macos-release-names.mjs";

export const root = process.cwd();
export const names = loadMacosReleaseNames(root);
export const { appBundleName } = names;
