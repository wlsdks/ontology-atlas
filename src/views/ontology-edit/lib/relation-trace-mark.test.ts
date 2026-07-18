import { describe, expect, it } from "vitest";
import { resolveRelationTraceMark } from "./relation-trace-mark";

describe("resolveRelationTraceMark", () => {
  it("계층 키(domains/capabilities/elements/contains)는 실선", () => {
    expect(resolveRelationTraceMark("domains")).toBe("solid");
    expect(resolveRelationTraceMark("capabilities")).toBe("solid");
    expect(resolveRelationTraceMark("elements")).toBe("solid");
    expect(resolveRelationTraceMark("contains")).toBe("solid");
  });

  it("의존/느슨한 연관(dependencies/relates)은 파선", () => {
    expect(resolveRelationTraceMark("dependencies")).toBe("dashed");
    expect(resolveRelationTraceMark("relates")).toBe("dashed");
  });

  it("근거(describes)는 점선", () => {
    expect(resolveRelationTraceMark("describes")).toBe("dotted");
  });
});
