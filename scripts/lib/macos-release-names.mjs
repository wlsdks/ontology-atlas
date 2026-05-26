import fs from "node:fs";
import path from "node:path";

export function loadMacosReleaseNames(root = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const tauriConfig = JSON.parse(
    fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
  );

  const appName = tauriConfig.productName ?? "Context Atlas";
  const releaseAssetName = pkg.name;
  const version = tauriConfig.version ?? pkg.version;
  const arch = process.env.TAURI_ARCH ?? (process.arch === "arm64" ? "aarch64" : process.arch);

  return {
    appName,
    appBundleName: `${appName}.app`,
    releaseAssetName,
    version,
    arch,
    tauriConfig,
    pkg,
  };
}

function executableFromInfoPlist(appPath) {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(infoPlistPath)) return null;
  const info = fs.readFileSync(infoPlistPath, "utf8");
  const match = info.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
  return match?.[1] ?? null;
}

export function resolveMacosExecutable(appPath, names) {
  const candidates = [
    executableFromInfoPlist(appPath),
    names.appName,
    names.releaseAssetName,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const executablePath = path.join(appPath, "Contents", "MacOS", candidate);
    if (fs.existsSync(executablePath)) return executablePath;
  }

  return path.join(appPath, "Contents", "MacOS", candidates[0] ?? names.appName);
}
