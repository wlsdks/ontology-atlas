import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { DEFAULT_DEV_ROUTE_PATHS, evaluateDevLocaleRoutes } from "./check-dev-locale-routes.mjs";

function createStatusServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        server.close();
        reject(new Error("server did not expose a TCP address"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test("default dev route smoke covers locale roots and source vault deeplinks", () => {
  assert.deepEqual(DEFAULT_DEV_ROUTE_PATHS, [
    "/",
    "/en/",
    "/ko/",
    "/en/docs/",
    "/ko/docs/?slug=ontology%2Fcapabilities%2Fagent-graph-readiness",
    "/ko/ontology/?node=capability%3Aagent-graph-readiness",
  ]);
});

test("evaluateDevLocaleRoutes passes when every route returns 2xx", async () => {
  const server = await createStatusServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  try {
    const report = await evaluateDevLocaleRoutes({
      baseUrl: server.baseUrl,
      paths: ["/", "/ko/", "/ko/docs/"],
      timeoutMs: 1000,
    });

    assert.equal(report.ok, true);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(
      report.checks.map((check) => [check.path, check.status, check.ok]),
      [
        ["/", 200, true],
        ["/ko/", 200, true],
        ["/ko/docs/", 200, true],
      ],
    );
  } finally {
    await server.close();
  }
});

test("evaluateDevLocaleRoutes reports the exact locale route that returns 404", async () => {
  const server = await createStatusServer((request, response) => {
    if (request.url === "/ko/docs/") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  try {
    const report = await evaluateDevLocaleRoutes({
      baseUrl: server.baseUrl,
      paths: ["/", "/ko/", "/ko/docs/"],
      timeoutMs: 1000,
    });

    assert.equal(report.ok, false);
    assert.deepEqual(
      report.failed.map((check) => [check.path, check.status]),
      [["/ko/docs/", 404]],
    );
  } finally {
    await server.close();
  }
});
