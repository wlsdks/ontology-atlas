import type { Page } from '@playwright/test';
import { installDesktopBridge } from '../rounds-desktop-bridge';

export async function installServiceSaveFixture(page: Page, options: { hold?: 'stage' | 'secret' | 'activate'; secretFailure?: boolean; activationFailure?: boolean } = {}) {
  await installDesktopBridge(page, { seedRounds: false });
  await page.addInitScript((settings) => {
    type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    type Bridge = { invoke: Invoke; [key: string]: unknown };
    const receipts = new Set<string>();
    const calls = { stage: 0, secret: 0, activate: 0 };
    let heldPhase = settings.hold;
    let held: (() => void) | null = null;
    let failSecret = settings.secretFailure === true;
    let failActivation = settings.activationFailure === true;
    const pause = (phase: 'stage' | 'secret' | 'activate') => heldPhase === phase
      ? new Promise<void>((resolve) => { held = resolve; }) : Promise.resolve();
    const wrap = (value: Bridge | undefined) => {
      if (!value || value.__serviceSaveWrapped) return value;
      const original = value.invoke.bind(value);
      value.invoke = async (command, args = {}) => {
        if (command === 'resolve_connector_runtimes') return [{ name: 'npx', path: '/test/runtime/npx' }];
        if (command === 'connector_secret_status') return { secretRef: args.secretRef, stored: receipts.has(String(args.secretRef)), last4: receipts.has(String(args.secretRef)) ? 'test' : null };
        if (command === 'connector_secret_set') {
          calls.secret++;
          await pause('secret');
          if (failSecret) throw new Error('test keychain save failed');
          receipts.add(String(args.secretRef));
          return { secretRef: args.secretRef, stored: true, last4: 'test' };
        }
        if ((command === 'write_vault_text_file' || command === 'create_vault_text_file') && String(args.relativePath) === '.ontology-atlas/connectors.json') {
          const parsed = JSON.parse(String(args.content));
          const setup = parsed.connectors?.find((row: {origin?: string}) => row.origin?.startsWith('library-import:'));
          if (setup) {
            const phase = setup.enabled ? 'activate' : 'stage';
            calls[phase]++;
            await pause(phase);
            if (phase === 'activate' && failActivation) throw new Error('test activation save failed');
          }
        }
        return original(command, args);
      };
      value.__serviceSaveWrapped = true;
      return value;
    };
    const target = window as unknown as { __TAURI_INTERNALS__?: Bridge; __serviceSaveHarness?: unknown };
    let current = wrap(target.__TAURI_INTERNALS__);
    Object.defineProperty(target, '__TAURI_INTERNALS__', {
      configurable: true,
      get: () => current,
      set: (value: Bridge) => { current = wrap(value); },
    });
    target.__serviceSaveHarness = {
      calls,
      get held() { return held !== null; },
      release() { heldPhase = undefined; const finish = held; held = null; finish?.(); },
      succeed() { failSecret = false; failActivation = false; },
    };
  }, options);
}

export interface ServiceSaveWindow extends Window {
  __roundsStubFiles: Record<string, string>;
  __serviceSaveHarness: { calls: {stage: number; secret: number; activate: number}; held: boolean; release(): void; succeed(): void };
}
