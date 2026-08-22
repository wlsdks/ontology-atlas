import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dmgNames = [
  "ontology-atlas_0.1.0_aarch64.dmg",
  "ontology-atlas_0.1.0_x64.dmg",
];
const dmgBody = (dmgName) => Buffer.from(`fake dmg bytes for ${dmgName}`);
const dmgHash = (dmgName) => crypto.createHash("sha256").update(dmgBody(dmgName)).digest("hex");
const validChecksum = (dmgName) => `${dmgHash(dmgName)}  ${dmgName}\n`;
const windowsName = "ontology-atlas_0.1.0_windows_x64-setup.exe";
const windowsBody = (name = windowsName) => Buffer.from(`fake Windows installer bytes for ${name}`);

function defaultWindowsAssets(tagName = "v0.1.0") {
  const name = `ontology-atlas_${tagName.replace(/^v/, "")}_windows_x64-setup.exe`;
  const body = windowsBody(name);
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  return [
    { name, body },
    { name: `${name}.sha256`, body: `${digest}  ${name}\n` },
  ];
}

function releaseExtraAssets(extraAssets = [], includeWindows = true, tagName = "v0.1.0") {
  const assetsByName = new Map(
    (includeWindows ? defaultWindowsAssets(tagName) : []).map((asset) => [asset.name, asset]),
  );
  for (const asset of extraAssets) assetsByName.set(asset.name, asset);
  return Array.from(assetsByName.values());
}

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function releasePayload(
  baseUrl,
  checksumTextFor = validChecksum,
  names = dmgNames,
  tagName = "v0.1.0",
  extraAssets = [],
  includeWindows = true,
) {
  return [
    {
      tag_name: tagName,
      draft: false,
      prerelease: false,
      assets: releaseExtraAssets(extraAssets, includeWindows, tagName).map((asset) => ({
        name: asset.name,
        browser_download_url: `${baseUrl}/download/${asset.name}`,
        url: `${baseUrl}/asset-api/${asset.name}`,
      })).concat(names.flatMap((dmgName) => [
        {
          name: dmgName,
          browser_download_url: `${baseUrl}/download/${dmgName}`,
          url: `${baseUrl}/asset-api/${dmgName}`,
        },
        {
          name: `${dmgName}.sha256`,
          browser_download_url: `${baseUrl}/download/${dmgName}.sha256`,
          url: `${baseUrl}/asset-api/${dmgName}.sha256`,
          checksumText: checksumTextFor(dmgName),
        },
      ])),
    },
  ];
}

function makeHandler({
  checksumTextFor = validChecksum,
  names = dmgNames,
  tagName = "v0.1.0",
  dmgContentType = "application/x-apple-diskimage",
  dmgContentLength = "123",
  requireAuth = false,
  extraAssets = [],
  includeWindows = true,
} = {}) {
  return (req, res) => {
    if (req.url === "/repos/wlsdks/ontology-atlas/releases?per_page=20") {
      if (requireAuth && req.headers.authorization !== "Bearer test-token") {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "API rate limit exceeded" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(releasePayload(`http://${req.headers.host}`, checksumTextFor, names, tagName, extraAssets, includeWindows)));
      return;
    }
    if (req.url === `/repos/wlsdks/ontology-atlas/releases/tags/${tagName}`) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(releasePayload(`http://${req.headers.host}`, checksumTextFor, names, tagName, extraAssets, includeWindows)[0]));
      return;
    }
    const extra = releaseExtraAssets(extraAssets, includeWindows, tagName).find(
      (asset) => req.url === `/download/${asset.name}` || req.url === `/asset-api/${asset.name}`,
    );
    if (extra) {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(extra.body ?? "");
      return;
    }
    const dmgName = names.find((name) => req.url === `/download/${name}`);
    if (dmgName && req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": dmgContentType,
        "Content-Length": dmgContentLength,
      });
      res.end();
      return;
    }
    if (dmgName && req.method === "GET") {
      const body = dmgBody(dmgName);
      res.writeHead(200, {
        "Content-Type": dmgContentType,
        "Content-Length": String(body.length),
      });
      res.end(body);
      return;
    }
    const apiDmgName = names.find((name) => req.url === `/asset-api/${name}`);
    if (apiDmgName && req.method === "GET") {
      if (req.headers.accept !== "application/octet-stream") {
        res.writeHead(406);
        res.end("not acceptable");
        return;
      }
      const body = dmgBody(apiDmgName);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
      });
      res.end(body);
      return;
    }
    const checksumName = names.find((name) => req.url === `/download/${name}.sha256`);
    if (checksumName && req.method === "HEAD") {
      const checksumText = checksumTextFor(checksumName);
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": String(Buffer.byteLength(checksumText)),
      });
      res.end();
      return;
    }
    if (checksumName && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(checksumTextFor(checksumName));
      return;
    }
    const apiChecksumName = names.find((name) => req.url === `/asset-api/${name}.sha256`);
    if (apiChecksumName && req.method === "GET") {
      if (req.headers.accept !== "application/octet-stream") {
        res.writeHead(406);
        res.end("not acceptable");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(checksumTextFor(apiChecksumName));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  };
}

async function runVerifier(baseUrl, env = {}) {
  return execFileAsync(process.execPath, ["scripts/check-macos-download-release.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OATLAS_GITHUB_API_BASE: baseUrl,
      ...env,
    },
  });
}

async function runVerifierWithArgs(baseUrl, args, env = {}) {
  return execFileAsync(process.execPath, ["scripts/check-macos-download-release.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OATLAS_GITHUB_API_BASE: baseUrl,
      ...env,
    },
  });
}

test("download release verifier checks reachable DMG and checksum contents", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const { stdout } = await runVerifier(baseUrl);

    assert.match(stdout, /exposes reachable public macOS download assets/);
    assert.match(stdout, new RegExp(`/download/${dmgNames[0]}`));
    assert.match(stdout, new RegExp(`/download/${dmgNames[1]}`));
    assert.match(stdout, new RegExp(`/download/${windowsName}`));
  });
});

test("download release verifier accepts pnpm forwarded argument separator", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const { stdout } = await runVerifierWithArgs(baseUrl, ["--", "--tag=v0.1.0"]);

    assert.match(stdout, /exposes reachable public macOS download assets/);
  });
});

test("download release verifier help describes the two architecture contract", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/check-macos-download-release.mjs", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.match(stdout, /Apple Silicon/);
  assert.match(stdout, /aarch64/);
  assert.match(stdout, /Intel/);
  assert.match(stdout, /x64/);
  assert.match(stdout, /exactly one DMG per architecture/);
  assert.match(stdout, /one Windows x64 setup executable/);
  assert.match(stdout, /matching \.sha256 checksums/);
});

test("download release verifier rejects checksum assets without the DMG line", async () => {
  await withServer(makeHandler({ checksumTextFor: () => `${"b".repeat(64)}  other.dmg\n` }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /does not contain a SHA-256 line/);
        return true;
      },
    );
  });
});

test("download release verifier rejects DMGs whose bytes do not match the checksum", async () => {
  await withServer(makeHandler({ checksumTextFor: (dmgName) => `${"b".repeat(64)}  ${dmgName}\n` }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /does not match checksum/);
        return true;
      },
    );
  });
});

test("download release verifier rejects Windows installers whose bytes do not match the checksum", async () => {
  await withServer(
    makeHandler({
      extraAssets: [{ name: windowsName, body: Buffer.from("tampered Windows installer") }],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /windows_x64-setup\.exe SHA-256 .* does not match checksum/);
          return true;
        },
      );
    },
  );
});

test("download release verifier requires exactly one Windows installer", async () => {
  await withServer(makeHandler({ includeWindows: false }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /exactly one ontology-atlas_<version>_windows_x64-setup\.exe/);
        assert.match(error.stderr, /found 0/);
        return true;
      },
    );
  });
});

test("download release verifier requires the Windows checksum sibling", async () => {
  await withServer(
    makeHandler({
      includeWindows: false,
      extraAssets: [{ name: windowsName, body: windowsBody() }],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /is missing .*windows_x64-setup\.exe\.sha256/);
          return true;
        },
      );
    },
  );
});

test("download release verifier requires Apple Silicon and Intel assets", async () => {
  await withServer(makeHandler({ names: [dmgNames[0]] }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /missing macOS DMG assets for: x64/);
        return true;
      },
    );
  });
});

test("download release verifier rejects duplicate architecture DMG assets", async () => {
  await withServer(
    makeHandler({
      names: [
        "ontology-atlas_0.1.0_aarch64.dmg",
        "ontology-atlas_0.1.0_x64.dmg",
        "ontology-atlas_0.1.0-a_aarch64.dmg",
      ],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /duplicate macOS DMG assets/);
          assert.match(error.stderr, /aarch64=/);
          assert.match(error.stderr, /Keep exactly one DMG per architecture/);
          return true;
        },
      );
    },
  );
});

test("download release verifier rejects mixed-version architecture assets", async () => {
  await withServer(
    makeHandler({
      names: [
        "ontology-atlas_0.1.0_aarch64.dmg",
        "ontology-atlas_0.0.9_x64.dmg",
      ],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /mismatched macOS DMG versions/);
          assert.match(error.stderr, /aarch64=0\.1\.0/);
          assert.match(error.stderr, /x64=0\.0\.9/);
          return true;
        },
      );
    },
  );
});

test("download release verifier rejects DMG versions that do not match the release tag", async () => {
  await withServer(makeHandler({ tagName: "v0.2.0" }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /do not match the tag version 0\.2\.0/);
        assert.match(error.stderr, /aarch64=0\.1\.0/);
        assert.match(error.stderr, /x64=0\.1\.0/);
        return true;
      },
    );
  });
});

test("download release verifier rejects unsupported ontology-atlas DMG asset names", async () => {
  await withServer(
    makeHandler({
      names: [...dmgNames, "ontology-atlas_0.1.0_arm64.dmg"],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /unsupported macOS DMG asset names/);
          assert.match(error.stderr, /ontology-atlas_0\.1\.0_arm64\.dmg/);
          assert.match(error.stderr, /aarch64\|x64/);
          return true;
        },
      );
    },
  );
});

test("download release verifier rejects universal DMGs so both release lanes stay explicit", async () => {
  await withServer(
    makeHandler({
      names: ["ontology-atlas_0.1.0_universal.dmg"],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /unsupported macOS DMG asset names/);
          assert.match(error.stderr, /ontology-atlas_0\.1\.0_universal\.dmg/);
          assert.match(error.stderr, /aarch64\|x64/);
          return true;
        },
      );
    },
  );
});

test("download release verifier rejects Ontology Atlas branded DMG asset names", async () => {
  await withServer(
    makeHandler({
      names: [...dmgNames, "Ontology Atlas_0.1.0_aarch64.dmg"],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /unsupported macOS DMG asset names/);
          assert.match(error.stderr, /Ontology Atlas_0\.1\.0_aarch64\.dmg/);
          assert.match(error.stderr, /ontology-atlas_<version>_<aarch64\|x64>\.dmg/);
          return true;
        },
      );
    },
  );
});

test("download release verifier requires a v-prefixed release tag", async () => {
  await withServer(makeHandler({ tagName: "0.1.0" }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /must use a v-prefixed tag/);
        return true;
      },
    );
  });
});

test("download release verifier explains missing requested release tags", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    await assert.rejects(
      runVerifierWithArgs(baseUrl, ["--", "--tag=v9.9.9"]),
      (error) => {
        assert.match(error.stderr, /release tag v9\.9\.9 was not found/);
        assert.match(error.stderr, /release-macos\.yml/);
        assert.doesNotMatch(error.stderr, /GET .* failed with 404/);
        return true;
      },
    );
  });
});

test("download release verifier rejects non-DMG asset responses", async () => {
  await withServer(makeHandler({ dmgContentType: "text/html" }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /DMG asset URL returned unexpected content-type/);
        return true;
      },
    );
  });
});

test("download release verifier rejects empty DMG asset responses", async () => {
  await withServer(makeHandler({ dmgContentLength: "0" }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl),
      (error) => {
        assert.match(error.stderr, /DMG asset URL returned an empty file/);
        return true;
      },
    );
  });
});

test("download release verifier accepts GH_TOKEN for authenticated GitHub API requests", async () => {
  await withServer(makeHandler({ requireAuth: true }), async (baseUrl) => {
    const { stdout } = await runVerifier(baseUrl, {
      GITHUB_TOKEN: "",
      GH_TOKEN: "test-token",
    });

    assert.match(stdout, /exposes reachable public macOS download assets/);
  });
});

test("download release verifier strips authorization on cross-origin asset redirects", async () => {
  const storageAuthorization = [];
  await withServer((req, res) => {
    storageAuthorization.push(req.headers.authorization);
    makeHandler()(req, res);
  }, async (storageBaseUrl) => {
    await withServer((req, res) => {
      if (
        req.url === "/repos/wlsdks/ontology-atlas/releases?per_page=20" ||
        req.url === "/repos/wlsdks/ontology-atlas/releases/tags/v0.1.0"
      ) {
        const payload = releasePayload(`http://${req.headers.host}`);
        payload[0].draft = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(req.url.includes("/tags/") ? payload[0] : payload));
        return;
      }
      if (req.url?.startsWith("/asset-api/")) {
        res.writeHead(302, {
          Location: `${storageBaseUrl}${req.url.replace("/asset-api/", "/download/")}`,
        });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end("not found");
    }, async (apiBaseUrl) => {
      const { stdout } = await runVerifierWithArgs(
        apiBaseUrl,
        ["--allow-draft", "--tag=v0.1.0"],
        { GITHUB_TOKEN: "test-token", GH_TOKEN: "" },
      );
      assert.match(stdout, /exposes reachable draft macOS download assets/);
    });
  });

  assert.ok(storageAuthorization.length > 0, "redirect target was never requested");
  assert.deepEqual(storageAuthorization, storageAuthorization.map(() => undefined));
});

test("download release verifier can validate draft assets before publishing", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const payload = releasePayload(baseUrl);
    payload[0].draft = true;
    await withServer((req, res) => {
      if (req.url === "/repos/wlsdks/ontology-atlas/releases?per_page=20") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
        return;
      }
      makeHandler()(req, res);
    }, async (draftBaseUrl) => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["scripts/check-macos-download-release.mjs", "--allow-draft"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            OATLAS_GITHUB_API_BASE: draftBaseUrl,
            GITHUB_TOKEN: "test-token",
          },
        },
      );

      assert.match(stdout, /exposes reachable draft macOS download assets/);
    });
  });
});

test("download release verifier can find tagged draft assets when the tag endpoint hides drafts", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const payload = releasePayload(baseUrl);
    payload[0].draft = true;
    await withServer((req, res) => {
      if (req.url === "/repos/wlsdks/ontology-atlas/releases/tags/v0.1.0") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Not Found" }));
        return;
      }
      if (req.url === "/repos/wlsdks/ontology-atlas/releases?per_page=100") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
        return;
      }
      makeHandler()(req, res);
    }, async (draftBaseUrl) => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["scripts/check-macos-download-release.mjs", "--tag=v0.1.0", "--allow-draft"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            OATLAS_GITHUB_API_BASE: draftBaseUrl,
            GITHUB_TOKEN: "test-token",
          },
        },
      );

      assert.match(stdout, /exposes reachable draft macOS download assets/);
    });
  });
});

test("download release verifier reports rate limits without a stack trace", async () => {
  await withServer(makeHandler({ requireAuth: true }), async (baseUrl) => {
    await assert.rejects(
      runVerifier(baseUrl, {
        GITHUB_TOKEN: "",
        GH_TOKEN: "",
      }),
      (error) => {
        assert.match(error.stderr, /Set GITHUB_TOKEN or GH_TOKEN/);
        assert.doesNotMatch(error.stderr, /at IncomingMessage/);
        return true;
      },
    );
  });
});

/**
 * 2026-07-27 v1.0.0-rc.1 이 CI 에서 실패한 그 상황 그대로다.
 *
 * RC 초안은 draft 라 `releases/tags/<tag>` 가 404 를 준다. 그러면 목록 폴백을
 * 타는데, 거기서만 "프리릴리스면 거부" 를 한 번 더 걸고 있었다 — 직접 조회
 * 경로에는 없는 필터다. 그래서 이름을 대고 찾았는데도 걸러졌고, 에러 메시지는
 * 엉뚱하게 "태그를 못 찾았다" 였다.
 *
 * 정식 태그로는 드러나지 않는다. 프리릴리스를 처음 내는 날에만 나타난다.
 */
test("download release verifier finds a prerelease draft that was requested by tag", async () => {
  const rcTag = "v1.0.0-rc.1";
  // DMG 이름의 버전은 태그와 맞아야 한다 — 이 테스트는 그 대조가 `-rc.1` 을
  // 포함한 버전에서도 성립하는지까지 함께 검사한다.
  const rcNames = ["ontology-atlas_1.0.0-rc.1_aarch64.dmg", "ontology-atlas_1.0.0-rc.1_x64.dmg"];
  await withServer((req, res) => {
    // draft 는 태그 직접 조회에서 404 다 — GitHub 의 실제 동작.
    if (req.url === `/repos/wlsdks/ontology-atlas/releases/tags/${rcTag}`) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not Found" }));
      return;
    }
    if (req.url === "/repos/wlsdks/ontology-atlas/releases?per_page=100") {
      const payload = releasePayload(`http://${req.headers.host}`, validChecksum, rcNames, rcTag);
      payload[0].draft = true;
      payload[0].prerelease = true;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      return;
    }
    makeHandler({ tagName: rcTag, names: rcNames })(req, res);
  }, async (baseUrl) => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/check-macos-download-release.mjs", `--tag=${rcTag}`, "--allow-draft"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OATLAS_GITHUB_API_BASE: baseUrl, GITHUB_TOKEN: "test-token" },
      },
    );

    // --allow-prerelease 를 주지 않았는데도 통과해야 한다. 이름을 댔기 때문이다.
    assert.match(stdout, /draft macOS download assets/);
  });
});

/**
 * `latest.json` 은 DMG 검사가 한 번도 열어보지 않던 파일이다. 앱은 이것 하나로
 * 갱신을 찾고, 어긋나면 오류 대신 "최신입니다" 를 보여준다 — 사용자는 영영
 * 모른다. `--require-updater` 는 그 경로를 릴리스 시점에 실제로 연다.
 */
const archiveNames = {
  "darwin-aarch64": "ontology-atlas_0.1.0_aarch64.app.tar.gz",
  "darwin-x86_64": "ontology-atlas_0.1.0_x64.app.tar.gz",
};

function updaterAssets(names = Object.values(archiveNames)) {
  return names.flatMap((name) => [
    { name, body: "archive" },
    { name: `${name}.sig`, body: "signature" },
  ]);
}

function updaterManifest(platforms) {
  return {
    version: "0.1.0",
    notes: "",
    pub_date: "2026-07-27T00:00:00Z",
    platforms:
      platforms ??
      Object.fromEntries(
        Object.entries(archiveNames).map(([platform, name]) => [
          platform,
          {
            signature: `sig-${platform}`,
            url: `https://github.com/wlsdks/ontology-atlas/releases/download/v0.1.0/${name}`,
          },
        ]),
      ),
  };
}

function withUpdater({ manifest = updaterManifest(), archives = updaterAssets() } = {}) {
  return makeHandler({
    extraAssets: [
      ...archives,
      { name: "latest.json", body: JSON.stringify(manifest) },
    ],
  });
}

test("updater gate accepts a manifest whose URLs exist in the release", async () => {
  await withServer(withUpdater(), async (baseUrl) => {
    const { stdout } = await runVerifierWithArgs(baseUrl, ["--tag=v0.1.0", "--require-updater"]);
    assert.match(stdout, /Updater: latest\.json/);
    assert.match(stdout, /ontology-atlas_0\.1\.0_aarch64\.app\.tar\.gz/);
  });
});

test("updater gate refuses a release with no latest.json", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    await assert.rejects(
      runVerifierWithArgs(baseUrl, ["--tag=v0.1.0", "--require-updater"]),
      (error) => /has no latest\.json asset/.test(error.stderr),
    );
  });
});

test("updater gate refuses a URL that no asset answers", async () => {
  // GitHub 은 자산 이름의 공백을 점으로 바꾼다. 매니페스트가 공백 이름을 적으면
  // 404 가 나고 앱은 그것을 "갱신 없음" 으로 표시한다.
  const manifest = updaterManifest({
    "darwin-aarch64": {
      signature: "sig",
      url: "https://github.com/wlsdks/ontology-atlas/releases/download/v0.1.0/Ontology%20Atlas.app.tar.gz",
    },
    "darwin-x86_64": {
      signature: "sig",
      url: `https://github.com/wlsdks/ontology-atlas/releases/download/v0.1.0/${archiveNames["darwin-x86_64"]}`,
    },
  });
  await withServer(withUpdater({ manifest }), async (baseUrl) => {
    await assert.rejects(
      runVerifierWithArgs(baseUrl, ["--tag=v0.1.0", "--require-updater"]),
      (error) => /is not an asset of v0\.1\.0/.test(error.stderr),
    );
  });
});

test("updater gate refuses both platforms pointing at one archive", async () => {
  // 그 상태로 나가면 한쪽 아키텍처 사용자가 다른 아키텍처의 앱을 받는다.
  const shared = archiveNames["darwin-aarch64"];
  const manifest = updaterManifest({
    "darwin-aarch64": {
      signature: "sig",
      url: `https://github.com/wlsdks/ontology-atlas/releases/download/v0.1.0/${shared}`,
    },
    "darwin-x86_64": {
      signature: "sig",
      url: `https://github.com/wlsdks/ontology-atlas/releases/download/v0.1.0/${shared}`,
    },
  });
  await withServer(withUpdater({ manifest }), async (baseUrl) => {
    await assert.rejects(
      runVerifierWithArgs(baseUrl, ["--tag=v0.1.0", "--require-updater"]),
      (error) => /points both platforms at/.test(error.stderr),
    );
  });
});

test("updater gate refuses an archive whose .sig never uploaded", async () => {
  const archives = updaterAssets().filter((asset) => !asset.name.endsWith(".sig"));
  await withServer(withUpdater({ archives }), async (baseUrl) => {
    await assert.rejects(
      runVerifierWithArgs(baseUrl, ["--tag=v0.1.0", "--require-updater"]),
      (error) => /refuses unsigned update packages/.test(error.stderr),
    );
  });
});

test("updater gate refuses a URL pinned to another tag", async () => {
  const manifest = updaterManifest({
    "darwin-aarch64": {
      signature: "sig",
      url: `https://github.com/wlsdks/ontology-atlas/releases/latest/download/${archiveNames["darwin-aarch64"]}`,
    },
    "darwin-x86_64": {
      signature: "sig",
      url: `https://github.com/wlsdks/ontology-atlas/releases/download/v0.1.0/${archiveNames["darwin-x86_64"]}`,
    },
  });
  await withServer(withUpdater({ manifest }), async (baseUrl) => {
    await assert.rejects(
      runVerifierWithArgs(baseUrl, ["--tag=v0.1.0", "--require-updater"]),
      (error) => /is not pinned to v0\.1\.0/.test(error.stderr),
    );
  });
});

test("the DMG-only path still passes without the updater flag", async () => {
  // 기존 호출자(관문 검증 등)가 매니페스트를 요구하지 않는다.
  await withServer(makeHandler(), async (baseUrl) => {
    const { stdout } = await runVerifierWithArgs(baseUrl, ["--tag=v0.1.0"]);
    assert.doesNotMatch(stdout, /Updater:/);
  });
});
