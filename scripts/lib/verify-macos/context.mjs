import { readMacosReleaseNames } from "../macos-release-names.mjs";

export const root = process.cwd();
export const names = readMacosReleaseNames(root);
export const { appBundleName } = names;
