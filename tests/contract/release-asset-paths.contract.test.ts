import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  artifactNameForArch,
  stageReleaseAssets,
} from "../../scripts/stage-macos-release-assets.mjs";
import { stageWindowsReleaseAssets } from "../../scripts/stage-windows-release-assets.mjs";
import {
  buildManifest,
  findUpdaterArtifacts,
  resolveArchDir,
} from "../../scripts/build-updater-manifest.mjs";

/**
 * 릴리스 자산의 **경로 계약**을 잠근다.
 *
 * 이 결함은 CI 만이 재현할 수 있는 자리에 있었다 — 태그를 세 번 찍고서야 알았다.
 * 빌드 두 잡은 서명·공증·Gatekeeper 검증까지 전부 통과했는데 스테이징이
 * "업데이터 아티팩트가 없는 아키텍처: aarch64, x64" 로 멈췄다. 만드는 쪽과 찾는
 * 쪽이 서로의 경로 규칙을 몰랐기 때문이다.
 *
 * 그래서 여기서는 **실제 레이아웃을 재현**한다: 진짜 스테이징 스크립트를 돌려
 * 아티팩트를 만들고, `download-artifact` 가 만드는 폴더 구조를 그대로 세우고,
 * 워크플로에서 **글롭 문자열을 읽어와** 그 위에 적용한다. 글롭을 여기 복제하면
 * 그 복제본이 드리프트한다 — 통과하는 테스트와 실패하는 릴리스가 다시 생긴다.
 */

const WORKFLOW_PATH = ".github/workflows/release-macos.yml";
const workflow = readFileSync(WORKFLOW_PATH, "utf-8");

const buildJob = section(workflow, "  build-macos:", "  stage-macos:");
const stageJob = section(workflow, "  stage-macos:", "  publish-macos:");
const publishJob = section(workflow, "  publish-macos:", null);

function section(source: string, from: string, to: string | null): string {
  const start = source.indexOf(from);
  const end = to ? source.indexOf(to) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
}

/** 이름으로 스텝 하나를 떼어낸다. 다음 `- name:` 전까지. */
function step(job: string, name: string): string {
  const lines = job.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  expect(start, `${name} 스텝을 찾지 못했다`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*- name:/.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

/** `key: value` 또는 `key: |` 블록의 값을 목록으로. 주석 줄은 값이 아니다. */
function yamlValues(block: string, key: string): string[] {
  const lines = block.split("\n");
  const index = lines.findIndex((line) => new RegExp(`^\\s*${key}:`).test(line));
  if (index === -1) return [];
  const inline = lines[index].slice(lines[index].indexOf(":") + 1).trim();
  if (inline && inline !== "|") return [inline];

  const indent = lines[index].search(/\S/);
  const values: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!line.trim()) continue;
    if (line.search(/\S/) <= indent) break;
    if (line.trim().startsWith("#")) continue;
    values.push(line.trim());
  }
  return values;
}

/** Tauri 가 실제로 내는 이름 그대로. 공백도, 아치 없음도 그대로. */
function fakeBundle(root: string, version: string, arch: string): string {
  const bundleDir = join(root, arch, "bundle");
  mkdirSync(join(bundleDir, "dmg"), { recursive: true });
  mkdirSync(join(bundleDir, "macos", "Ontology Atlas.app"), { recursive: true });
  const dmg = `ontology-atlas_${version}_${arch}.dmg`;
  writeFileSync(join(bundleDir, "dmg", dmg), `dmg-${arch}`);
  writeFileSync(join(bundleDir, "dmg", `${dmg}.sha256`), `${"a".repeat(64)}  ${dmg}\n`);
  writeFileSync(join(bundleDir, "macos", "Ontology Atlas.app.tar.gz"), `archive-${arch}`);
  writeFileSync(join(bundleDir, "macos", "Ontology Atlas.app.tar.gz.sig"), `sig-${arch}\n`);
  return bundleDir;
}

const VERSION = "1.0.0-rc.5";
const TAG = `v${VERSION}`;
const REPO = "wlsdks/ontology-atlas";
const scratch = mkdtempSync(join(tmpdir(), "oa-release-paths-"));

/**
 * 워크플로가 만드는 것을 그대로 만든다: 아치별로 스테이징을 돌리고, 그 결과를
 * `download-artifact`(`merge-multiple: false`)가 놓는 자리에 놓는다.
 */
function replayDownloadRoot(arches: string[]): { root: string; staged: Map<string, string[]> } {
  const home = mkdtempSync(join(scratch, "run-"));
  const root = join(home, "release-assets");
  mkdirSync(root, { recursive: true });
  const staged = new Map<string, string[]>();
  for (const arch of arches) {
    const bundleDir = fakeBundle(home, VERSION, arch);
    const result = stageReleaseAssets({
      bundleDir,
      outDir: join(root, artifactNameForArch(arch)),
      expectArch: arch,
    });
    staged.set(arch, result.files);
  }
  return { root, staged };
}

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("릴리스 자산 경로 계약", () => {
  it("업로드 경로는 하나다 — 여럿이면 루트를 우리가 정하지 못한다", () => {
    // 여러 경로를 주면 `upload-artifact` 가 최소공통조상을 루트로 잡는다.
    // v1.0.0-rc.1 에서 그 루트가 `bundle/` 이 되어 `dmg/`·`macos/` 한 겹이 더
    // 생겼고, 내려받는 쪽은 그 깊이를 알 방법이 없었다.
    const upload = step(buildJob, "Upload workflow artifact");
    expect(yamlValues(upload, "path")).toEqual(["release-upload"]);
    expect(yamlValues(upload, "name")).toEqual(["ontology-atlas-macos-${{ matrix.arch }}"]);
    expect(buildJob).toContain("node scripts/stage-macos-release-assets.mjs");
  });

  it("아티팩트 폴더 이름이 아치를 나른다", () => {
    // 다운로드 시 두 아치를 가르는 것은 폴더뿐이다.
    const uploadName = yamlValues(step(buildJob, "Upload workflow artifact"), "name")[0];
    for (const arch of ["aarch64", "x64"]) {
      expect(uploadName.replace("${{ matrix.arch }}", arch)).toBe(artifactNameForArch(arch));
    }
  });

  it("매니페스트 빌더가 실제 레이아웃에서 두 아치를 찾는다", () => {
    const { root } = replayDownloadRoot(["aarch64", "x64"]);
    const platforms: Record<string, { archiveName: string; signature: string }> = {};
    for (const arch of ["aarch64", "x64"]) {
      const found = findUpdaterArtifacts(resolveArchDir(root, arch));
      expect(found, `${arch} 의 업데이터 아티팩트를 찾지 못했다`).not.toBeNull();
      platforms[arch] = {
        archiveName: found!.archiveName,
        signature: readFileSync(found!.signaturePath, "utf8").trim(),
      };
    }
    expect(platforms.aarch64.archiveName).not.toBe(platforms.x64.archiveName);
    expect(platforms.aarch64.signature).toBe("sig-aarch64");
    expect(platforms.x64.signature).toBe("sig-x64");
  });

  it("아치 하나가 빠지면 반쪽짜리로 나가지 않는다", () => {
    // 한쪽만 내면 그 아키텍처 사용자는 영영 갱신을 못 받는다 — 오류도 없이.
    const { root } = replayDownloadRoot(["aarch64"]);
    expect(resolveArchDir(root, "x64")).toBeNull();

    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        buildManifest({
          version: VERSION,
          notes: "",
          pubDate: "2026-07-27T00:00:00Z",
          repo: REPO,
          tag: TAG,
          platforms: { aarch64: { archiveName: "a.app.tar.gz", signature: "sig" } },
        }),
      ).toThrow(/exit 1/);
      expect(error.mock.calls.join(" ")).toMatch(/x64/);
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it("릴리스 업로드 글롭이 실제 레이아웃의 모든 자산에 매칭된다", () => {
    // 글롭은 워크플로에서 읽어온다. 여기 복제하면 그 복제본이 드리프트한다.
    const globs = yamlValues(step(stageJob, "Upload draft GitHub Release assets"), "files");
    expect(globs.length).toBeGreaterThan(0);

    const { root, staged } = replayDownloadRoot(["aarch64", "x64"]);
    const cwd = join(root, "..");
    writeFileSync(join(root, "latest.json"), "{}\n");

    const windowsBundle = join(cwd, "windows-bundle");
    mkdirSync(join(windowsBundle, "nsis"), { recursive: true });
    writeFileSync(
      join(windowsBundle, "nsis", "Ontology Atlas_1.0.0_x64-setup.exe"),
      "windows",
    );
    const windows = stageWindowsReleaseAssets({
      bundleDir: windowsBundle,
      outDir: join(root, "windows"),
      version: VERSION,
    });

    const expected = new Set<string>(["release-assets/latest.json"]);
    for (const [arch, files] of staged) {
      for (const file of files) {
        expected.add(`release-assets/${artifactNameForArch(arch)}/${file}`);
      }
    }
    for (const file of windows.files) expected.add(`release-assets/windows/${file}`);

    const matched = new Set<string>();
    for (const glob of globs) {
      const hits = globSync(glob, { cwd }).map((hit) => hit.split("\\").join("/"));
      // 아무것도 잡지 못하는 글롭은 계약이 아니라 오해다.
      expect(hits, `${glob} 이 아무 자산도 잡지 못했다`).not.toHaveLength(0);
      for (const hit of hits) matched.add(hit);
    }

    expect([...matched].sort()).toEqual([...expected].sort());
  });

  it("스테이징 잡은 아치별 폴더로 내려받는다", () => {
    const download = step(stageJob, "Download macOS artifacts");
    expect(yamlValues(download, "merge-multiple")).toEqual(["false"]);
    expect(yamlValues(download, "path")).toEqual(["release-assets"]);
  });

  it("발행 잡의 요약 글롭도 자기 레이아웃에 맞는다", () => {
    // 이 잡은 `merge-multiple: true` 로 평평하게 받는다 — 스테이징이 이름에
    // 버전과 아치를 넣은 뒤라야 여덟 자산이 안 겹친다.
    expect(yamlValues(step(publishJob, "Download macOS artifacts"), "merge-multiple")).toEqual([
      "true",
    ]);
    const summaryGlob = publishJob.match(/for dmg in (\S+); do/)?.[1];
    expect(summaryGlob).toBeTruthy();

    const { root, staged } = replayDownloadRoot(["aarch64", "x64"]);
    const merged = mkdtempSync(join(scratch, "merged-"));
    const flat = join(merged, "release-assets");
    mkdirSync(flat, { recursive: true });
    const names = new Set<string>();
    for (const [arch, files] of staged) {
      for (const file of files) {
        // 이름이 겹치면 하나가 다른 하나를 조용히 덮는다 — 합치기 전에 잡는다.
        expect(names.has(file), `${file} 이름이 두 아치에서 겹친다`).toBe(false);
        names.add(file);
        writeFileSync(
          join(flat, file),
          readFileSync(join(root, artifactNameForArch(arch), file)),
        );
      }
    }
    expect(globSync(summaryGlob!, { cwd: merged })).toHaveLength(2);
  });

  it("latest.json 의 URL 이 실제로 올라가는 자산 이름과 같다", () => {
    // 업데이터가 이 URL 로 받는다. 어긋나면 404 를 "갱신 없음" 으로 표시한다 —
    // 사용자는 영영 모른다.
    const { root, staged } = replayDownloadRoot(["aarch64", "x64"]);
    const platforms: Record<string, { archiveName: string; signature: string }> = {};
    for (const arch of ["aarch64", "x64"]) {
      const found = findUpdaterArtifacts(resolveArchDir(root, arch))!;
      platforms[arch] = {
        archiveName: found.archiveName,
        signature: readFileSync(found.signaturePath, "utf8").trim(),
      };
    }
    const manifest = buildManifest({
      version: VERSION,
      notes: "",
      pubDate: "2026-07-27T00:00:00Z",
      repo: REPO,
      tag: TAG,
      platforms,
    });

    const uploaded = new Set([...staged.values()].flat());
    const urls = (Object.values(manifest.platforms) as { url: string }[]).map(
      (platform) => platform.url,
    );
    expect(new Set(urls).size).toBe(2);
    for (const url of urls) {
      const name = decodeURIComponent(url.split("/").pop() ?? "");
      expect(uploaded.has(name)).toBe(true);
      // GitHub 은 자산 이름의 공백을 점으로 바꾼다. 공백이 남아 있으면 여기 적힌
      // URL 과 실제 자산이 어긋난다.
      expect(name).not.toMatch(/\s/);
      expect(url).toBe(encodeURI(url));
      expect(url.startsWith(`https://github.com/${REPO}/releases/download/${TAG}/`)).toBe(true);
    }
  });
});
