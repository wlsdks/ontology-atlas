import { describe, expect, it } from "vitest";
import { parseOntologyReaderIntent } from "./ontology-reader-intent";

describe("parseOntologyReaderIntent", () => {
  it("accepts the supported stakeholder reader intents", () => {
    expect(parseOntologyReaderIntent("planning")).toBe("planning");
    expect(parseOntologyReaderIntent("marketing")).toBe("marketing");
    expect(parseOntologyReaderIntent("leadership")).toBe("leadership");
    expect(parseOntologyReaderIntent("developer")).toBe("developer");
    expect(parseOntologyReaderIntent("agent")).toBe("agent");
  });

  it("ignores unknown or missing reader values", () => {
    expect(parseOntologyReaderIntent(null)).toBeNull();
    expect(parseOntologyReaderIntent("sales")).toBeNull();
    expect(parseOntologyReaderIntent("")).toBeNull();
  });
});
