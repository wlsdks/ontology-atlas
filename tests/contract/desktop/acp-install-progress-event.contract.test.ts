import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The event name is a contract between two languages.**
 *
 * Rust emits with `app.emit(<name>, payload)` and the screen listens with
 * `listen(<name>)`, but that string is **written separately on each side**.
 * Change one and everything compiles, lints, and stays green while install
 * progress simply **never appears**. It is the kind of failure that raises no
 * error at all.
 *
 * The payload's key names are locked by the Rust unit tests
 * (`acp_install_progress_tests`). What is locked here is the **name**.
 */

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8');

/** Extracts just the value from `const ACP_INSTALL_PROGRESS_EVENT: &str = "…";`. */
function rustEventName(): string {
  const source = read('src-tauri/src/acp/runtime.rs');
  const match = /const ACP_INSTALL_PROGRESS_EVENT: &str = "([^"]+)"/.exec(source);
  if (!match) throw new Error('could not find the Rust event name constant — was the name changed?');
  return match[1];
}

/** The name the screen actually listens for: `listen<AcpInstallProgress>('…')`. */
function screenEventName(): string {
  const source = read('src/features/acp-doctor/model/acp-doctor.ts');
  const match = /listen<AcpInstallProgress>\(\s*'([^']+)'/.exec(source);
  if (!match) throw new Error('could not find the screen-side listen call — was the wiring changed?');
  return match[1];
}

describe('install progress event — name contract', () => {
  it('the name Rust emits equals the name the screen listens for', () => {
    expect(screenEventName()).toBe(rustEventName());
  });

  it('the checker does not idle — it really read values from both sides', () => {
    // If both extractors return `null`, the test above passes as "equal" and this
    // contract becomes a check that guards nothing.
    const name = rustEventName();
    expect(name).toMatch(/^acp-install:\/\//);
    expect(screenEventName()).toMatch(/^acp-install:\/\//);
  });
});
