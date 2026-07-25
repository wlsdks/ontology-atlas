import { describe, expect, it } from "vitest";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_PACKAGE,
  buildCursorMcpDeeplink,
  buildMcpDeeplinkConfig,
  buildVsCodeMcpDeeplink,
  utf8ToBase64,
} from "./mcp-deeplinks";

describe("buildMcpDeeplinkConfig", () => {
  it("builds the standard stdio triple with the absolute vault path", () => {
    expect(buildMcpDeeplinkConfig("/Users/j/vault")).toEqual({
      command: "npx",
      args: ["-y", MCP_SERVER_PACKAGE],
      env: { OATLAS_VAULT: "/Users/j/vault" },
    });
  });

  it("returns null when the absolute path is unknown (web session)", () => {
    expect(buildMcpDeeplinkConfig(null)).toBeNull();
    expect(buildMcpDeeplinkConfig(undefined)).toBeNull();
    expect(buildMcpDeeplinkConfig("")).toBeNull();
  });
});

describe("utf8ToBase64", () => {
  it("round-trips ascii", () => {
    expect(utf8ToBase64("abc")).toBe("YWJj");
  });

  it("encodes unicode (Korean) paths without corruption", () => {
    const input = "/Users/j/한글-vault";
    const encoded = utf8ToBase64(input);
    // decode via Buffer to verify byte fidelity
    expect(Buffer.from(encoded, "base64").toString("utf-8")).toBe(input);
  });
});

describe("buildCursorMcpDeeplink", () => {
  it("emits the cursor deeplink scheme with base64 config", () => {
    const link = buildCursorMcpDeeplink("/Users/j/vault");
    expect(link).not.toBeNull();
    const url = new URL(link as string);
    expect(url.protocol).toBe("cursor:");
    expect(`${url.hostname}${url.pathname}`).toBe(
      "anysphere.cursor-deeplink/mcp/install",
    );
    expect(url.searchParams.get("name")).toBe(MCP_SERVER_NAME);
    const config = url.searchParams.get("config");
    expect(config).toBeTruthy();
    const decoded = JSON.parse(
      Buffer.from(config as string, "base64").toString("utf-8"),
    );
    expect(decoded).toEqual({
      command: "npx",
      args: ["-y", MCP_SERVER_PACKAGE],
      env: { OATLAS_VAULT: "/Users/j/vault" },
    });
  });

  it("preserves a unicode vault path through base64", () => {
    const link = buildCursorMcpDeeplink("/Users/j/한글 vault") as string;
    const config = new URL(link).searchParams.get("config") as string;
    const decoded = JSON.parse(
      Buffer.from(config, "base64").toString("utf-8"),
    );
    expect(decoded.env.OATLAS_VAULT).toBe("/Users/j/한글 vault");
  });

  it("returns null without an absolute path", () => {
    expect(buildCursorMcpDeeplink(null)).toBeNull();
  });
});

describe("buildVsCodeMcpDeeplink", () => {
  it("emits the vscode deeplink with url-encoded config incl. name", () => {
    const link = buildVsCodeMcpDeeplink("/Users/j/vault") as string;
    expect(link.startsWith("vscode:mcp/install?")).toBe(true);
    const raw = link.slice("vscode:mcp/install?".length);
    const decoded = JSON.parse(decodeURIComponent(raw));
    expect(decoded).toEqual({
      name: MCP_SERVER_NAME,
      command: "npx",
      args: ["-y", MCP_SERVER_PACKAGE],
      env: { OATLAS_VAULT: "/Users/j/vault" },
    });
  });

  it("url-encodes spaces in the path (no raw spaces in the link)", () => {
    const link = buildVsCodeMcpDeeplink("/Users/j/my vault") as string;
    expect(link).not.toContain(" ");
    const decoded = JSON.parse(
      decodeURIComponent(link.slice("vscode:mcp/install?".length)),
    );
    expect(decoded.env.OATLAS_VAULT).toBe("/Users/j/my vault");
  });

  it("returns null without an absolute path", () => {
    expect(buildVsCodeMcpDeeplink(undefined)).toBeNull();
  });
});
