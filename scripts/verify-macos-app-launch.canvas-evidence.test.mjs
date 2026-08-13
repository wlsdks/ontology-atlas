import assert from "node:assert/strict";
import test from "node:test";
import { buildWebviewEvidencePayload } from "./lib/verify-macos/evidence-payload.mjs";

test("WebView evidence proves the current topology-map-v2 canvas renderer", () => {
  const evidence = buildWebviewEvidencePayload({
    href: "tauri://localhost/ko/topology/",
    bodyText: "Atlas 지도 INDEX 74 개념",
    markers: {
      topologyMapEngine: "v2",
      topologySigmaViewportVisible: true,
      topologySigmaCanvasCount: 1,
      topologyV2CanvasInkPixels: 128,
      topologySigmaBootError: false,
    },
  });

  assert.deepEqual(evidence.topologyRenderProof, {
    proof: "topology-map-v2-canvas-render",
    status: "proved",
    route: "/ko/topology/",
    engine: "v2",
    viewportVisible: true,
    canvasCount: 1,
    inkPixels: 128,
    agentNextAction:
      "use visual evidence for node-level rendering; do not infer DOM-card counts from the canvas engine",
  });
});

test("v2 canvas evidence stays incomplete without rendered pixels", () => {
  const evidence = buildWebviewEvidencePayload({
    href: "tauri://localhost/ko/topology/",
    bodyText: "Atlas 지도 INDEX 74 개념",
    markers: {
      topologyMapEngine: "v2",
      topologySigmaViewportVisible: true,
      topologySigmaCanvasCount: 1,
      topologyV2CanvasInkPixels: 0,
      topologySigmaBootError: false,
    },
  });

  assert.equal(evidence.topologyRenderProof.status, "incomplete");
});
