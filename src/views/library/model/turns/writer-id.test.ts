import { describe, expect, it } from "vitest";

import { agentWriterId, compileWriterId } from "./writer-id";

describe("agentWriterId", () => {
  it("names the connected agent, or says unknown before one is chosen", () => {
    expect(agentWriterId({ id: "claude-code" })).toBe("agent:claude-code");
    expect(agentWriterId(null)).toBe("agent:unknown");
    expect(agentWriterId(undefined)).toBe("agent:unknown");
  });
});

describe("compileWriterId", () => {
  it("names the local model on the local route and the agent otherwise", () => {
    expect(compileWriterId("local", { model: "llama" }, { id: "claude-code" })).toBe("model:llama");
    expect(compileWriterId("local", null, null)).toBe("model:unknown");
    expect(compileWriterId("agent", { model: "llama" }, { id: "claude-code" })).toBe("agent:claude-code");
    expect(compileWriterId("agent", null, null)).toBe("agent:unknown");
  });
});
