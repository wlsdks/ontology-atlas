import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dmgNames = [
  "oh-my-ontology_0.1.0_aarch64.dmg",
  "oh-my-ontology_0.1.0_x64.dmg",
];
const dmgBody = (dmgName) => Buffer.from(`fake dmg bytes for ${dmgName}`);
const dmgHash = (dmgName) => crypto.createHash("sha256").update(dmgBody(dmgName)).digest("hex");
const validChecksum = (dmgName) => `${dmgHash(dmgName)}  ${dmgName}\n`;

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

function releasePayload(baseUrl, checksumTextFor = validChecksum, names = dmgNames, tagName = "v0.1.0") {
  return [
    {
      tag_name: tagName,
      draft: false,
      prerelease: false,
      assets: names.flatMap((dmgName) => [
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
      ]),
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
} = {}) {
  return (req, res) => {
    if (req.url === "/repos/wlsdks/oh-my-ontology/releases?per_page=20") {
      if (requireAuth && req.headers.authorization !== "Bearer test-token") {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "API rate limit exceeded" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(releasePayload(`http://${req.headers.host}`, checksumTextFor, names, tagName)));
      return;
    }
    if (req.url === `/repos/wlsdks/oh-my-ontology/releases/tags/${tagName}`) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(releasePayload(`http://${req.headers.host}`, checksumTextFor, names, tagName)[0]));
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
      OMOT_GITHUB_API_BASE: baseUrl,
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
      OMOT_GITHUB_API_BASE: baseUrl,
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
  });
});

test("download release verifier accepts pnpm forwarded argument separator", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const { stdout } = await runVerifierWithArgs(baseUrl, ["--", "--tag=v0.1.0"]);

    assert.match(stdout, /exposes reachable public macOS download assets/);
  });
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

test("download release verifier rejects mixed-version architecture assets", async () => {
  await withServer(
    makeHandler({
      names: [
        "oh-my-ontology_0.1.0_aarch64.dmg",
        "oh-my-ontology_0.0.9_x64.dmg",
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

test("download release verifier rejects unsupported oh-my-ontology DMG asset names", async () => {
  await withServer(
    makeHandler({
      names: [...dmgNames, "oh-my-ontology_0.1.0_arm64.dmg"],
    }),
    async (baseUrl) => {
      await assert.rejects(
        runVerifier(baseUrl),
        (error) => {
          assert.match(error.stderr, /unsupported macOS DMG asset names/);
          assert.match(error.stderr, /oh-my-ontology_0\.1\.0_arm64\.dmg/);
          assert.match(error.stderr, /aarch64\|x64\|universal/);
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

test("download release verifier can validate draft assets before publishing", async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const payload = releasePayload(baseUrl);
    payload[0].draft = true;
    await withServer((req, res) => {
      if (req.url === "/repos/wlsdks/oh-my-ontology/releases?per_page=20") {
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
            OMOT_GITHUB_API_BASE: draftBaseUrl,
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
      if (req.url === "/repos/wlsdks/oh-my-ontology/releases/tags/v0.1.0") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Not Found" }));
        return;
      }
      if (req.url === "/repos/wlsdks/oh-my-ontology/releases?per_page=100") {
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
            OMOT_GITHUB_API_BASE: draftBaseUrl,
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
