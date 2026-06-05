import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCommandForLog } from "./redact-command.mjs";

describe("formatCommandForLog", () => {
  it("redacts split secret flag values", () => {
    const command = formatCommandForLog("xcrun", [
      "notarytool",
      "submit",
      "Ontology Atlas.dmg",
      "--apple-id",
      "maintainer@example.com",
      "--password",
      "app-specific-password",
      "--team-id",
      "TEAM123",
    ]);

    assert.equal(
      command,
      "xcrun notarytool submit Ontology Atlas.dmg --apple-id [redacted] --password [redacted] --team-id TEAM123",
    );
  });

  it("redacts equals-form secret flag values", () => {
    const command = formatCommandForLog("xcrun", [
      "notarytool",
      "submit",
      "app.dmg",
      "--keychain-profile=Release Profile",
    ]);

    assert.equal(
      command,
      "xcrun notarytool submit app.dmg --keychain-profile=[redacted]",
    );
  });

  it("leaves non-secret flags visible", () => {
    const command = formatCommandForLog("codesign", [
      "--verify",
      "--deep",
      "--verbose=2",
      "Ontology Atlas.app",
    ]);

    assert.equal(command, "codesign --verify --deep --verbose=2 Ontology Atlas.app");
  });
});
