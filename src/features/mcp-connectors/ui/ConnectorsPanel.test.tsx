import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';

const bridge = vi.hoisted(() => ({
  discoveryAvailable: true,
  secretsAvailable: true,
  discovered: null as unknown,
  /** Makes `discover_mcp_connectors` reject, as an unreadable config file does. */
  discoveryRejects: false,
  secretSets: [] as Array<{ ref: string; secret: string }>,
  secretDeletes: [] as string[],
  stored: new Map<string, string>(),
}));
const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/shared/lib/use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => motion.reduced,
}));

vi.mock('@/shared/lib/tauri-connectors', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tauri-connectors')>(
    '@/shared/lib/tauri-connectors',
  );
  return {
    ...actual,
    isConnectorDiscoveryAvailable: () => bridge.discoveryAvailable,
    discoverMcpConnectors: async () => {
      if (bridge.discoveryRejects) throw new Error('discover_mcp_connectors failed');
      return bridge.discovered;
    },
  };
});

vi.mock('@/shared/lib/tauri-connector-secrets', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tauri-connector-secrets')>(
    '@/shared/lib/tauri-connector-secrets',
  );
  return {
    ...actual,
    isConnectorSecretBridgeAvailable: () => bridge.secretsAvailable,
    connectorSecretStatus: async (secretRef: string) => ({
      secretRef,
      stored: bridge.stored.has(secretRef),
      last4: bridge.stored.get(secretRef) ?? null,
    }),
    connectorSecretDelete: async (secretRef: string) => {
      bridge.secretDeletes.push(secretRef);
      bridge.stored.delete(secretRef);
      window.dispatchEvent(new Event('ontology-atlas:connector-secret-change'));
      return { secretRef, stored: false, last4: null };
    },
    connectorSecretSet: async (secretRef: string, secret: string) => {
      bridge.secretSets.push({ ref: secretRef, secret });
      bridge.stored.set(secretRef, secret.slice(-4));
      // The real bridge announces this so another mounted panel re-asks the keychain; the stand-in
      // announces it too, or the test would measure a screen the product never renders.
      window.dispatchEvent(new Event('ontology-atlas:connector-secret-change'));
      return { secretRef, stored: true, last4: secret.slice(-4) };
    },
  };
});

import { MCP_CATALOGUE } from '@/shared/config/mcp-catalogue';
import type { ConnectorRecord } from '@/shared/lib/connector-record';

import { ConnectorsPanel, connectorDestination, whatRuns } from './ConnectorsPanel';
import { groupDiscovered, shortSourceKey } from './discovered-groups';
import { useVaultConnectors } from '../model/use-vault-connectors';

/**
 * The caller owns the list state, so the tab strip's count and the rows come from one read;
 * the harness plays the caller.
 */
function Panel({
  handle,
  countInHeading = false,
}: {
  handle: FileSystemDirectoryHandle | null;
  countInHeading?: boolean;
}) {
  const store = useVaultConnectors(handle);
  return (
    <ConnectorsPanel
      handle={handle}
      store={store}
      countInHeading={countInHeading}
      /* The view's slot, stood in for here, since the panel may not import it (FSD). */
      openFolderAction={<button type="button" data-testid="connectors-open-vault">open</button>}
    />
  );
}

/**
 * A row's variables, keychain fields and removal live in its more-actions dialog.
 */
function openDetail() {
  fireEvent.click(screen.getByTestId('connectors-item-menu'));
}

/**
 * Removal asks first, because forgetting keychain items cannot be undone.
 */
function confirmRemove() {
  fireEvent.click(screen.getByTestId('connectors-item-remove'));
  fireEvent.click(screen.getByTestId('connectors-remove-confirm'));
}

function openAdd() {
  fireEvent.click(screen.getByTestId('connectors-add-open'));
}

/**
 * The by-hand form is a disclosure under the found and catalogue groups, so tests unfold it.
 */
function openCustomTab() {
  fireEvent.click(screen.getByTestId('connectors-custom-toggle'));
}

/** A folder handle backed by a map, enough for the store to read and write. */
function fakeVault(seed?: string, rootPath?: string) {
  const files = new Map<string, string>();
  if (seed !== undefined) files.set('.ontology-atlas/connectors.json', seed);
  const directories = new Set<string>(seed === undefined ? [] : ['.ontology-atlas']);
  const handle = {
    ...(rootPath ? { rootPath } : {}),
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      if (!directories.has(name)) {
        if (!options?.create) throw new DOMException('not found', 'NotFoundError');
        directories.add(name);
      }
      return {
        getFileHandle: async (fileName: string, fileOptions?: { create?: boolean }) => {
          const path = `${name}/${fileName}`;
          if (!files.has(path) && !fileOptions?.create) {
            throw new DOMException('not found', 'NotFoundError');
          }
          return {
            getFile: async () => ({ text: async () => files.get(path)! }),
            createWritable: async () => {
              let text = '';
              return {
                write: async (chunk: string) => {
                  text += chunk;
                },
                close: async () => {
                  files.set(path, text);
                },
              };
            },
          };
        },
      };
    },
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, files };
}

function draw(node: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      {node}
    </NextIntlClientProvider>,
  );
}

const stdioRecord = {
  id: 'c1',
  name: 'notion',
  transport: 'stdio' as const,
  command: '/opt/homebrew/bin/npx',
  args: ['-y', '@notionhq/notion-mcp-server'],
  env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' }],
  headers: [],
  enabled: false,
};

function seeded(...connectors: unknown[]) {
  return JSON.stringify({ version: 1, connectors });
}

beforeEach(() => {
  motion.reduced = false;
  bridge.discoveryAvailable = true;
  bridge.secretsAvailable = true;
  bridge.discovered = null;
  bridge.secretSets = [];
  bridge.discoveryRejects = false;
  bridge.secretDeletes = [];
  bridge.stored = new Map();
});

afterEach(cleanup);

/**
 * The card states the enabled count unless the caller's heading does (`countInHeading`).
 * Both directions are asserted, so the silencing prop has something to silence.
 */
/**
 * A rejected scan must stop saying it is reading, and must not say "found none", a claim a
 * failed read has not earned.
 */
describe('connectors panel reports a failed scan as finished', () => {
  it('reports scan failure instead of loading', async () => {
    bridge.discoveryRejects = true;
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-discovery-failed')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('connectors-scanning')).toBeNull();
  });

  it('reports scan failure in the add dialog instead of none found', async () => {
    bridge.discoveryRejects = true;
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('connectors-add-open'));
    const failed = await screen.findAllByTestId('connectors-discovery-failed');
    expect(failed.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('connectors-found-empty')).toBeNull();
    expect(screen.queryByTestId('connectors-scanning')).toBeNull();
  });
});

describe('connectors panel states the count once', () => {
  it('shows the enabled count on the card without a header', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-on-of-total')).toHaveTextContent('1');
  });

  it('does not repeat the count on the card when the header shows it', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} countInHeading />);
    await waitFor(() => expect(screen.getByTestId('connectors-item')).toBeInTheDocument());
    expect(screen.queryByTestId('connectors-on-of-total')).toBeNull();
  });
});

describe('connectors panel explains what runs before enabling', () => {
  it('states the command, the traffic destination and the unlogged records before enabling', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item')).toBeInTheDocument(),
    );
    // The command and its arguments, not the friendly name, which says nothing about what runs.
    expect(screen.getByTestId('connectors-item-runs')).toHaveTextContent(
      '/opt/homebrew/bin/npx -y @notionhq/notion-mcp-server',
    );
    /*
     * The claim that the transfer log does not record this traffic is pinned, not the filename;
     * `docs/features/agents.md` names the file.
     */
    /*
     * Three sentences stand under the rows, so deciding whether to attach meets them without a
     * toll gate before the first row.
     */
    expect(screen.getByTestId('connectors-transfer')).toHaveTextContent('전송 기록에도 남지 않아요');
    expect(screen.getByTestId('connectors-transfer').querySelectorAll('p')).toHaveLength(3);
    expect(screen.getByTestId('connectors-runtime-agents')).toHaveAttribute(
      'href',
      expect.stringContaining('/agents'),
    );
    openDetail();
    expect(await screen.findByTestId('connectors-runtime')).toBeInTheDocument();
    // The switch is off before anybody touches it.
    expect(screen.getByTestId('connectors-item')).toHaveAttribute(
      'data-connector-enabled',
      'false',
    );
  });

  it('writes to the folder only when enabled', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('connectors-item-toggle'));
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item')).toHaveAttribute(
        'data-connector-enabled',
        'true',
      ),
    );
    expect(vault.files.get('.ontology-atlas/connectors.json')).toContain('"enabled": true');
  });

  it('states that a name is already registered before enabling', async () => {
    // codex-acp drops a same-named ACP server silently, which looks like Atlas failing to attach.
    bridge.discovered = {
      connectors: [
        {
          source: 'codex-user',
          name: 'notion',
          transport: 'stdio',
          command: '/usr/bin/npx',
          args: [],
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-collision')).toBeInTheDocument(),
    );
  });

  it('disables enabling a connector that cannot run and states why', async () => {
    // A bare command finds nothing in the agent's sanitized environment, so its tools would be
    // silently absent.
    const vault = fakeVault(seeded({ ...stdioRecord, command: 'npx' }));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-problem')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-item-toggle')).toBeDisabled();
  });

  it('sends the token to the keychain and clears the input', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-secret-missing')).toBeInTheDocument(),
    );
    openDetail();
    const input = screen.getByTestId('connectors-item-secret-input');
    fireEvent.change(input, { target: { value: 'ntn_live_value' } });
    fireEvent.click(screen.getByTestId('connectors-item-secret-save'));
    await waitFor(() =>
      expect(bridge.secretSets).toEqual([
        { ref: 'connector:c1:NOTION_TOKEN', secret: 'ntn_live_value' },
      ]),
    );
    // The field is cleared once stored; there is no read path back.
    await waitFor(() => expect(input).toHaveValue(''));
    // …and the token never lands in the vault file.
    expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').not.toContain(
      'ntn_live_value',
    );
  });

  it('cannot enable while the keychain has no value', async () => {
    /*
     * Without a stored value the connector would attach and every call would be refused.
     */
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-toggle')).toBeDisabled());
    // The reason stays in the row; a disabled control whose reason is a press away has none.
    expect(screen.getByTestId('connectors-item-problem')).toBeInTheDocument();

    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    openDetail();
    fireEvent.change(screen.getByTestId('connectors-item-secret-input'), {
      target: { value: 'ntn_live_value' },
    });
    fireEvent.click(screen.getByTestId('connectors-item-secret-save'));
    await waitFor(() => expect(screen.getByTestId('connectors-item-toggle')).toBeEnabled());
  });

  it('allows choosing the keychain for a name that does not look like a credential', async () => {
    /*
     * `OPENAPI_MCP_HEADERS` carries `Bearer ntn_…` for Notion's MCP server; a name-only rule
     * offered no field and the connector attached without its credential.
     */
    const vault = fakeVault(
      seeded({ ...stdioRecord, env: [{ name: 'OPENAPI_MCP_HEADERS' }] }),
    );
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable')).toHaveAttribute(
        'data-variable-keychain',
        'false',
      ),
    );
    fireEvent.click(screen.getByTestId('connectors-item-variable-keychain'));
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable')).toHaveAttribute(
        'data-variable-keychain',
        'true',
      ),
    );
    // The file now holds a keychain reference, and a field for the value appears.
    expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').toContain(
      'connector:c1:OPENAPI_MCP_HEADERS',
    );
    expect(screen.getByTestId('connectors-item-secret-input')).toBeInTheDocument();
  });

  it('writes a non-credential value into the folder file', async () => {
    // Forcing a version pin into a keychain means re-entering it per machine, a rule people route
    // around.
    const vault = fakeVault(seeded({ ...stdioRecord, env: [{ name: 'NOTION_VERSION' }] }));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable-value')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('connectors-item-variable-value'), {
      target: { value: '2022-06-28' },
    });
    await waitFor(() =>
      expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').toContain('2022-06-28'),
    );
  });

  it('gives no input for a credential name with the keychain off and states why', async () => {
    // The writer refuses a literal under this name, so a box would silently drop its contents.
    const vault = fakeVault(seeded({ ...stdioRecord, env: [{ name: 'NOTION_TOKEN' }] }));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable-refused')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('connectors-item-variable-value')).toBeNull();
  });

  it('deletes the referenced token from this computer when a connector is removed', async () => {
    /*
     * Removing a connector must also forget its keychain items, and only those, or a token stays
     * on a machine somebody hands on.
     */
    const vault = fakeVault(
      seeded({
        ...stdioRecord,
        env: [
          { name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' },
          { name: 'OPENAPI_MCP_HEADERS', secretRef: 'connector:c1:OPENAPI_MCP_HEADERS' },
          { name: 'NOTION_VERSION', value: '2022-06-28' },
        ],
      }),
    );
    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    bridge.stored.set('connector:c1:OPENAPI_MCP_HEADERS', 'ders');
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    await waitFor(() => expect(screen.getByTestId('connectors-item-remove')).toBeInTheDocument());
    confirmRemove();

    // Every reference the record carried, and only those; the plain value has nothing to forget.
    await waitFor(() =>
      expect([...bridge.secretDeletes].sort()).toEqual([
        'connector:c1:NOTION_TOKEN',
        'connector:c1:OPENAPI_MCP_HEADERS',
      ]),
    );
    // …and a read afterwards says absent, which is what the person was promised.
    expect(bridge.stored.size).toBe(0);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').not.toContain('notion');
  });

  it('deletes the stored value when the keychain choice is turned off', async () => {
    // Turning the choice off means the value should not be on this machine; dropping only the
    // reference would orphan it.
    const vault = fakeVault(seeded(stdioRecord));
    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable-keychain')).toBeChecked(),
    );
    fireEvent.click(screen.getByTestId('connectors-item-variable-keychain'));
    await waitFor(() => expect(bridge.secretDeletes).toEqual(['connector:c1:NOTION_TOKEN']));
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable')).toHaveAttribute(
        'data-variable-keychain',
        'false',
      ),
    );
    expect(bridge.stored.size).toBe(0);
  });

  it('names what will be removed and asks before deleting', async () => {
    /*
     * Removing the row is retypeable, but forgetting tokens is an irreversible keychain delete,
     * so the confirmation names the keys.
     */
    const vault = fakeVault(
      seeded({
        ...stdioRecord,
        env: [
          { name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' },
          { name: 'NOTION_VERSION', value: '2022-06-28' },
        ],
      }),
    );
    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    fireEvent.click(screen.getByTestId('connectors-item-remove'));

    const confirm = await screen.findByTestId('connectors-item-remove-confirm');
    // An alert dialog, because the body is the warning; assistive tech reads it on open.
    expect(confirm).toHaveAttribute('role', 'alertdialog');
    expect(confirm).toHaveAttribute('aria-modal', 'true');
    // The key it will forget, by name; the plain value loses nothing.
    expect(confirm).toHaveTextContent('NOTION_TOKEN');
    expect(confirm).not.toHaveTextContent('NOTION_VERSION');
    // Nothing has happened yet.
    expect(bridge.secretDeletes).toEqual([]);
    expect(screen.getByTestId('connectors-item')).toBeInTheDocument();
  });

  it('keeps the row and token on cancel', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    fireEvent.click(screen.getByTestId('connectors-item-remove'));
    fireEvent.click(await screen.findByTestId('connectors-remove-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('connectors-item-remove-confirm')).toBeNull(),
    );
    expect(screen.getByTestId('connectors-item')).toBeInTheDocument();
    expect(bridge.secretDeletes).toEqual([]);
    expect(bridge.stored.has('connector:c1:NOTION_TOKEN')).toBe(true);
    expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').toContain('notion');
  });

  it('announces the removal and moves focus after deleting', async () => {
    /*
     * The opener lived in a row that no longer exists, so focus goes to "Add a connector" instead
     * of `<body>`, and the removal is announced.
     */
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    confirmRemove();

    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('connectors-add-open')),
    );
    const live = document.querySelector('[role="status"][aria-live="polite"]');
    expect(live?.textContent ?? '').toContain('notion');
  });

  it('asks to open a folder instead of showing an empty list without a vault', async () => {
    /*
     * With no folder, a save resolves to `null`; an empty list would read the same as a working
     * save (phantom save), so the panel asks for the folder instead.
     */
    draw(<Panel handle={null} />);
    await waitFor(() => expect(screen.getByTestId('connectors-no-folder')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-open-vault')).toBeInTheDocument();
    // Not an empty list, and no invitation to add into nothing.
    expect(screen.queryByTestId('connectors-empty')).toBeNull();
    expect(screen.queryByTestId('connectors-list')).toBeNull();
    expect(screen.queryByTestId('connectors-add-open')).toBeNull();
  });

  it('keeps the dialog open and states why when saving fails', async () => {
    /*
     * A refused write (here a malformed file) keeps the dialog open: it closes on the result,
     * not on the click.
     */
    const vault = fakeVault('{ not json');
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-malformed')).toBeInTheDocument());
    openAdd();
    openCustomTab();
    fireEvent.change(screen.getByTestId('connectors-custom-name'), { target: { value: 'github' } });
    fireEvent.change(screen.getByTestId('connectors-custom-command'), {
      target: { value: '/usr/local/bin/github-mcp' },
    });
    fireEvent.click(screen.getByTestId('connectors-custom-add'));

    const alert = await screen.findByTestId('connectors-add-failed');
    expect(alert).toHaveAttribute('role', 'alert');
    // The errand did not finish, so the dialog does not close.
    expect(screen.getByTestId('connectors-add-dialog')).toBeInTheDocument();
    expect(vault.files.get('.ontology-atlas/connectors.json')).toBe('{ not json');
  });

  it('explains in the browser what is unavailable and what still works', async () => {
    bridge.discoveryAvailable = false;
    bridge.secretsAvailable = false;
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-list')).toBeInTheDocument());
    /*
     * The browser card stands in the add dialog where the scan would be: a reason and a place to
     * go beside a list that still works.
     */
    openAdd();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-discovery-unavailable')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('connectors-web-get-app')).toHaveAttribute(
      'href',
      expect.stringContaining('/download'),
    );
    fireEvent.keyDown(document, { key: 'Escape' });

    openDetail();
    expect(screen.getByTestId('connectors-item-secrets-unavailable')).toHaveTextContent(
      'NOTION_TOKEN',
    );
    // …and the choice cannot be made where there is no keychain.
    expect(screen.getByTestId('connectors-item-variable-keychain')).toBeDisabled();
  });

  it('adds a manual connector disabled', async () => {
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    openCustomTab();
    fireEvent.change(screen.getByTestId('connectors-custom-name'), {
      target: { value: 'github' },
    });
    fireEvent.change(screen.getByTestId('connectors-custom-command'), {
      target: { value: '/usr/local/bin/github-mcp' },
    });
    /*
     * A variable is a name and a value on one row; a credential-shaped name still cannot carry a
     * literal into the file (`secretRef`).
     */
    fireEvent.click(screen.getByTestId('connectors-custom-variable-add'));
    fireEvent.change(screen.getByTestId('connectors-custom-variable-name'), {
      target: { value: 'GITHUB_TOKEN' },
    });
    fireEvent.click(screen.getByTestId('connectors-custom-add'));
    await waitFor(() => expect(screen.getByTestId('connectors-item')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-item')).toHaveAttribute(
      'data-connector-enabled',
      'false',
    );
    const written = vault.files.get('.ontology-atlas/connectors.json') ?? '';
    // The key's name is in the file and its value is not.
    expect(written).toContain('GITHUB_TOKEN');
    expect(written).toContain('secretRef');
  });

  it('discovers registered servers in the app and states why a transport is unsupported', async () => {
    bridge.discovered = {
      connectors: [
        {
          source: 'claude-user',
          name: 'linear',
          transport: 'http',
          command: null,
          args: [],
          url: 'https://mcp.linear.app/mcp',
          envKeys: [],
          headerKeys: ['Authorization'],
        },
        {
          source: 'cursor-user',
          name: 'legacy',
          transport: 'sse',
          command: null,
          args: [],
          url: 'https://example.test/sse',
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(2));
    // The deprecated transport is shown and explained, never offered.
    const rows = screen.getAllByTestId('connectors-found-item');
    expect(rows[1]).toHaveAttribute('data-connector-transport', 'sse');
    expect(screen.getAllByTestId('connectors-found-add')).toHaveLength(1);
  });

  it('shows one row for a server registered in several files and lists the sources', async () => {
    /*
     * One row per server even when several config files register it.
     */
    bridge.discovered = {
      connectors: [
        {
          source: 'claude-user',
          name: 'notion',
          transport: 'stdio',
          command: '/opt/homebrew/bin/npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          envKeys: [],
          headerKeys: [],
        },
        {
          source: 'codex-user',
          // A different spelling of the same registration: the name is invented, so it does not decide
          // identity.
          name: 'notion-mcp',
          transport: 'stdio',
          command: '/opt/homebrew/bin/npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(1));
    expect(screen.getByTestId('connectors-found-item')).toHaveAttribute(
      'data-connector-sources',
      'claude-user codex-user',
    );
    // Both tools are named, once each.
    expect(screen.getAllByTestId('connectors-found-source').map((el) => el.textContent)).toEqual([
      'claude',
      'codex',
    ]);
  });

  it('filters the list by name or command', async () => {
    bridge.discovered = {
      connectors: [
        {
          source: 'claude-user',
          name: 'notion',
          transport: 'stdio',
          command: '/opt/homebrew/bin/npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          envKeys: [],
          headerKeys: [],
        },
        {
          source: 'claude-user',
          name: 'linear',
          transport: 'http',
          command: null,
          args: [],
          url: 'https://mcp.linear.app/mcp',
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(2));

    fireEvent.change(screen.getByTestId('connectors-search'), { target: { value: 'linear' } });
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(1));

    // …and by what actually runs, which is what somebody remembers about a renamed server.
    fireEvent.change(screen.getByTestId('connectors-search'), { target: { value: 'notionhq' } });
    await waitFor(() =>
      expect(screen.getByTestId('connectors-found-item')).toHaveTextContent('notion'),
    );

    // Nothing anywhere: one card carrying the door to the by-hand form; the fold's toggle waits.
    fireEvent.change(screen.getByTestId('connectors-search'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByTestId('connectors-add-none')).toBeInTheDocument());
    expect(screen.queryByTestId('connectors-found-section')).toBeNull();
    expect(screen.queryByTestId('connectors-catalogue-section')).toBeNull();
    expect(screen.queryByTestId('connectors-custom-toggle')).toBeNull();
    fireEvent.click(screen.getByTestId('connectors-add-none-custom'));
    await waitFor(() => expect(screen.getByTestId('connectors-custom-name')).toHaveFocus());
    expect(screen.queryByTestId('connectors-add-none-custom')).toBeNull();
    expect(screen.getByTestId('connectors-custom-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('adds a catalog row without inputs in one press, disabled and with its source', async () => {
    /*
     * A press attaches what asks nothing: Context7 needs no sign-in or token, so it goes straight
     * into the folder, off, with its origin. Hosted OAuth addresses are not offered because the
     * in-app session cannot open their sign-in window.
     */
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const context7 = document.querySelector(
      '[data-testid="connectors-catalogue-item"][data-catalogue-id="context7"]',
    ) as HTMLElement;
    expect(context7).not.toBeNull();
    // The address it will write is on the row, verbatim, before the press.
    expect(context7.querySelector('[data-testid="connectors-catalogue-runs"]')).toHaveTextContent(
      'https://mcp.context7.com/mcp',
    );
    const add = context7.querySelector('[data-testid="connectors-catalogue-add"]') as HTMLElement;
    expect(add).toHaveAttribute('data-press', 'attaches');
    fireEvent.click(add);
    await waitFor(() => expect(screen.getByTestId('connectors-item')).toBeInTheDocument());
    // The dialog leaves through its exit spring, so wait for the DOM.
    await waitFor(() => expect(screen.queryByTestId('connectors-add-dialog')).toBeNull());
    expect(screen.getByTestId('connectors-item')).toHaveAttribute('data-connector-enabled', 'false');
    const written = vault.files.get('.ontology-atlas/connectors.json') ?? '';
    expect(written).toContain('https://mcp.context7.com/mcp');
    expect(written).toContain('catalogue:context7@');
    expect(bridge.secretSets).toEqual([]);
  });

  it('asks inline for one token, stores the value in the keychain and writes only the name', async () => {
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const notion = document.querySelector(
      '[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]',
    ) as HTMLElement;
    // Notion needs a token, so the row's own button asks rather than attaches.
    const add = notion.querySelector('[data-testid="connectors-catalogue-add"]') as HTMLElement;
    expect(add).toHaveAttribute('data-variant-kind', 'local');
    expect(add).toHaveAttribute('data-press', 'asks');
    fireEvent.click(add);
    const ask = await screen.findByTestId('connectors-catalogue-ask');
    expect(ask).toHaveAttribute('data-variant-kind', 'local');
    // The command is written above the field, and the press waits for the value.
    expect(ask).toHaveTextContent('@notionhq/notion-mcp-server');
    expect(screen.getByTestId('connectors-catalogue-ask-add')).toBeDisabled();
    fireEvent.change(screen.getByTestId('connectors-catalogue-ask-value'), {
      target: { value: 'ntn_live_value' },
    });
    expect(screen.getByTestId('connectors-catalogue-ask-add')).toBeEnabled();
    expect(vault.files.get('.ontology-atlas/connectors.json')).toBeUndefined();
    fireEvent.click(screen.getByTestId('connectors-catalogue-ask-add'));
    await waitFor(() => expect(screen.getByTestId('connectors-item')).toBeInTheDocument());
    const written = vault.files.get('.ontology-atlas/connectors.json') ?? '';
    expect(written).toContain('NOTION_TOKEN');
    expect(written).toContain('secretRef');
    expect(written).not.toContain('ntn_live_value');
    await waitFor(() => expect(bridge.secretSets).toHaveLength(1));
    expect(bridge.secretSets[0].secret).toBe('ntn_live_value');
    expect(bridge.secretSets[0].ref).toMatch(/NOTION_TOKEN$/);
  });

  it('offers no value input without a keychain and states why', async () => {
    bridge.discoveryAvailable = false;
    bridge.secretsAvailable = false;
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const notion = document.querySelector(
      '[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]',
    ) as HTMLElement;
    fireEvent.click(notion.querySelector('[data-testid="connectors-catalogue-add"]') as HTMLElement);
    const ask = await screen.findByTestId('connectors-catalogue-ask');
    // A box whose contents would be thrown away is worse than no box.
    expect(screen.queryByTestId('connectors-catalogue-ask-value')).toBeNull();
    expect(screen.queryByTestId('connectors-catalogue-ask-add')).toBeNull();
    expect(ask).toHaveTextContent('NOTION_TOKEN');
    // The by-hand form can still take the name without a value.
    fireEvent.click(screen.getByTestId('connectors-catalogue-ask-edit'));
    await waitFor(() => expect(screen.getByTestId('connectors-custom-name')).toHaveValue('notion'));
    expect(screen.getByTestId('connectors-custom-provenance')).toBeInTheDocument();
  });

  it('reduced motion brings an edited catalogue prefill into view without smooth scrolling', async () => {
    motion.reduced = true;
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    bridge.discoveryAvailable = false;
    bridge.secretsAvailable = false;
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const notion = document.querySelector(
      '[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]',
    ) as HTMLElement;
    fireEvent.click(notion.querySelector('[data-testid="connectors-catalogue-add"]') as HTMLElement);
    await screen.findByTestId('connectors-catalogue-ask');
    fireEvent.click(screen.getByTestId('connectors-catalogue-ask-edit'));

    await screen.findByTestId('connectors-custom-name');
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('labels an already connected service instead of showing a button', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-list')).toBeInTheDocument());
    openAdd();
    const notion = document.querySelector(
      '[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]',
    ) as HTMLElement;
    expect(notion).toHaveAttribute('data-catalogue-attached', 'true');
    expect(notion.querySelector('[data-testid="connectors-catalogue-add"]')).toBeNull();
    expect(notion.querySelector('[data-testid="connectors-catalogue-attached"]')).not.toBeNull();
  });

  it('shows three discovered rows and folds the rest into a count until searched', async () => {
    /*
     * The catalogue leads and the scan follows, folded past three rows unless searching.
     */
    bridge.discovered = {
      connectors: ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((name) => ({
        source: 'claude-user',
        name,
        transport: 'stdio',
        // No letter shared with the names below, so a search matches names alone.
        command: `/opt/x/${name}`,
        args: [],
        envKeys: [],
        headerKeys: [],
      })),
      sources: [],
    };
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(3));
    const groups = screen.getByTestId('connectors-add-groups');
    const order = Array.from(groups.querySelectorAll('section')).map((node) =>
      node.getAttribute('data-testid'),
    );
    expect(order.indexOf('connectors-catalogue-section')).toBeLessThan(
      order.indexOf('connectors-found-section'),
    );
    const more = screen.getByTestId('connectors-found-more');
    expect(more).toHaveTextContent('2');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(5);
    expect(screen.getByTestId('connectors-found-more')).toHaveAttribute('aria-expanded', 'true');
    // A search shows every match and hides the fold.
    fireEvent.change(screen.getByTestId('connectors-search'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.queryByTestId('connectors-found-more')).toBeNull());
    expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(4);
  });

  it('connector detail has one corner close button', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    const dialog = await screen.findByTestId('connectors-item-dialog');
    expect(dialog.querySelectorAll('[data-testid="connectors-item-close"]')).toHaveLength(1);
    const closers = Array.from(dialog.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === '닫기',
    );
    expect(closers).toHaveLength(0);
    fireEvent.click(screen.getByTestId('connectors-item-close'));
    await waitFor(() => expect(screen.queryByTestId('connectors-item-dialog')).toBeNull());
  });

  it('closes by the corner button or Escape with no button below the list', async () => {
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const dialog = screen.getByTestId('connectors-add-dialog');
    expect(dialog.querySelectorAll('[data-testid="connectors-add-close"]')).toHaveLength(1);
    const closers = Array.from(dialog.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === '닫기',
    );
    expect(closers).toHaveLength(0);
    fireEvent.click(screen.getByTestId('connectors-add-close'));
    await waitFor(() => expect(screen.queryByTestId('connectors-add-dialog')).toBeNull());
  });
});

describe('a press that writes shows the whole line first', () => {
  function wholeLines(scope: ParentNode): string[] {
    return Array.from(scope.querySelectorAll('code'))
      .filter(
        (code) =>
          (code.classList.contains('break-all') ||
            code.classList.contains('[overflow-wrap:anywhere]')) &&
          !code.classList.contains('truncate'),
      )
      .map((code) => code.textContent ?? '');
  }

  function writtenLines(files: Map<string, string>): string[] {
    const text = files.get('.ontology-atlas/connectors.json');
    if (!text) return [];
    return (JSON.parse(text) as { connectors: ConnectorRecord[] }).connectors.map(whatRuns);
  }

  it.each(
    MCP_CATALOGUE.flatMap((entry) =>
      entry.variants.map((variant) => [entry.id, variant.kind] as const),
    ),
  )('the %s row writes its %s way in only after showing that line whole', async (id, kind) => {
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const row = document.querySelector(
      `[data-testid="connectors-catalogue-item"][data-catalogue-id="${id}"]`,
    ) as HTMLElement;
    let shown = wholeLines(row);
    fireEvent.click(
      row.querySelector(
        `[data-testid="connectors-catalogue-add"][data-variant-kind="${kind}"], [data-testid="connectors-catalogue-other"][data-variant-kind="${kind}"]`,
      ) as HTMLElement,
    );
    if (screen.queryByTestId('connectors-catalogue-ask')) {
      expect(writtenLines(vault.files)).toEqual([]);
      for (const field of screen.queryAllByTestId('connectors-catalogue-ask-value')) {
        fireEvent.change(field, { target: { value: 'typed-value' } });
      }
      shown = wholeLines(row);
      fireEvent.click(screen.getByTestId('connectors-catalogue-ask-add'));
    }
    await waitFor(() => expect(writtenLines(vault.files)).toHaveLength(1));
    expect(shown).toContain(writtenLines(vault.files)[0]);
  });

  it('without a keychain, a way in that asks nothing still attaches from its panel', async () => {
    bridge.secretsAvailable = false;
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const context7 = document.querySelector(
      '[data-testid="connectors-catalogue-item"][data-catalogue-id="context7"]',
    ) as HTMLElement;
    fireEvent.click(
      context7.querySelector('[data-testid="connectors-catalogue-other"]') as HTMLElement,
    );
    const shown = wholeLines(await screen.findByTestId('connectors-catalogue-ask'));
    fireEvent.click(screen.getByTestId('connectors-catalogue-ask-add'));
    await waitFor(() => expect(writtenLines(vault.files)).toHaveLength(1));
    expect(shown).toContain(writtenLines(vault.files)[0]);
  });

  it.each([
    ['a program', { transport: 'stdio', command: '/usr/bin/npx', args: ['-y', 'pkg'], url: null }],
    ['an address', { transport: 'http', command: null, args: [], url: 'https://mcp.example.test/mcp' }],
    [
      'a program that also names an address',
      {
        transport: 'stdio',
        command: '/bin/sh',
        args: ['-c', 'echo unseen'],
        url: 'https://mcp.example.test/mcp',
      },
    ],
  ])('a found row for %s writes only the line it showed whole', async (_, shape) => {
    bridge.discovered = {
      connectors: [{ source: 'vault-mcp-json', name: 'found', envKeys: [], headerKeys: [], ...shape }],
      sources: [],
    };
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    const row = await screen.findByTestId('connectors-found-item');
    const shown = wholeLines(row);
    fireEvent.click(row.querySelector('[data-testid="connectors-found-add"]') as HTMLElement);
    await waitFor(() => expect(writtenLines(vault.files)).toHaveLength(1));
    expect(shown).toContain(writtenLines(vault.files)[0]);
  });

  it('the by-hand form, arriving filled, adds only the line it showed whole', async () => {
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
    const notion = document.querySelector(
      '[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]',
    ) as HTMLElement;
    fireEvent.click(notion.querySelector('[data-testid="connectors-catalogue-add"]') as HTMLElement);
    fireEvent.click(await screen.findByTestId('connectors-catalogue-ask-edit'));
    await waitFor(() => expect(screen.getByTestId('connectors-custom-name')).toHaveValue('notion'));
    fireEvent.change(screen.getByTestId('connectors-custom-command'), {
      target: { value: '/opt/homebrew/bin/npx' },
    });
    const shown = wholeLines(screen.getByTestId('connectors-custom'));
    fireEvent.click(screen.getByTestId('connectors-custom-add'));
    await waitFor(() => expect(writtenLines(vault.files)).toHaveLength(1));
    expect(shown).toContain(writtenLines(vault.files)[0]);
  });

  it('the switch turns on only a line its row showed whole', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    const row = await screen.findByTestId('connectors-item');
    const shown = wholeLines(row);
    fireEvent.click(screen.getByTestId('connectors-item-toggle'));
    await waitFor(() => expect(row).toHaveAttribute('data-connector-enabled', 'true'));
    expect(shown).toContain(whatRuns(stdioRecord));
  });
});

describe('a connector a shared folder switched on, in the app', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stays off here, says what it would run and pass, and one press allows exactly that', async () => {
    const shared = {
      ...stdioRecord,
      env: [...stdioRecord.env, { name: 'NOTION_VERSION', value: '2022-06-28' }],
      enabled: true,
    };
    bridge.stored.set('connector:c1:NOTION_TOKEN', 'abcd');
    const vault = fakeVault(seeded(shared), '/Users/probe/cloned');
    const before = vault.files.get('.ontology-atlas/connectors.json');
    draw(<Panel handle={vault.handle} />);

    const row = await screen.findByTestId('connectors-item');
    expect(row).toHaveAttribute('data-connector-enabled', 'false');
    expect(row).toHaveAttribute('data-connector-waiting', 'true');
    expect(screen.getByTestId('connectors-on-of-total')).toHaveTextContent('1개 중 0개 켜짐');
    expect(screen.getByTestId('connectors-item-waiting')).toHaveTextContent(ko.connectors.waitingHere);
    expect(screen.getByTestId('connectors-item-runs')).toHaveTextContent(whatRuns(shared));
    const passes = screen.getByTestId('connectors-item-waiting-passes');
    expect(passes).toHaveTextContent('NOTION_TOKEN(키체인에서)');
    expect(passes).toHaveTextContent('NOTION_VERSION=2022-06-28');

    fireEvent.click(screen.getByTestId('connectors-item-allow'));
    await waitFor(() => expect(row).toHaveAttribute('data-connector-enabled', 'true'));
    expect(screen.queryByTestId('connectors-item-waiting')).not.toBeInTheDocument();
    expect(vault.files.get('.ontology-atlas/connectors.json')).toBe(before);
  });
});

describe('one row per thing that actually runs', () => {
  const base = {
    transport: 'stdio' as const,
    command: '/usr/bin/npx',
    args: ['-y', 'pkg'],
    url: null,
    envKeys: [],
    headerKeys: [],
  };

  it('collapses identical transport, command and arguments across files', () => {
    const groups = groupDiscovered([
      { ...base, source: 'claude-user', name: 'a' },
      { ...base, source: 'codex-user', name: 'b' },
      { ...base, source: 'claude-user', name: 'c' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].server.name).toBe('a');
    // A file that reported it twice is still one chip.
    expect(groups[0].sources).toEqual(['claude-user', 'codex-user']);
  });

  it('keeps a different command apart, and never merges across transports', () => {
    const groups = groupDiscovered([
      { ...base, source: 'claude-user', name: 'a' },
      { ...base, source: 'claude-user', name: 'a', args: ['-y', 'other'] },
      {
        source: 'claude-user',
        name: 'a',
        transport: 'http' as const,
        command: null,
        args: [],
        url: 'https://example.test/mcp',
        envKeys: [],
        headerKeys: [],
      },
    ]);
    expect(groups).toHaveLength(3);
  });

  it.each(['sse', 'unknown'] as const)(
    'tells %s servers without a command apart by their address',
    (transport) => {
      const remote = { transport, command: null, args: [], envKeys: [], headerKeys: [] };
      const groups = groupDiscovered([
        { ...remote, source: 'cursor-user', name: 'a', url: 'https://a.test/sse' },
        { ...remote, source: 'cursor-user', name: 'b', url: 'https://b.test/sse' },
        { ...remote, source: 'claude-user', name: 'a-again', url: 'https://a.test/sse' },
      ]);
      expect(groups.map((group) => group.server.name)).toEqual(['a', 'b']);
      expect(groups[0].sources).toEqual(['cursor-user', 'claude-user']);
    },
  );

  it('reduces a source id to the tool a person recognises', () => {
    expect(shortSourceKey('claude-user')).toBe('claude');
    expect(shortSourceKey('claude-project')).toBe('claude');
    expect(shortSourceKey('codex-user')).toBe('codex');
    expect(shortSourceKey('cursor-user')).toBe('cursor');
    expect(shortSourceKey('vault-mcp-json')).toBe('folder');
    expect(shortSourceKey('something-new')).toBe('other');
  });
});

describe('what runs, in one line', () => {
  it('joins a command with its arguments, and gives a URL back whole', () => {
    expect(whatRuns(stdioRecord)).toBe(
      '/opt/homebrew/bin/npx -y @notionhq/notion-mcp-server',
    );
    expect(
      whatRuns({ ...stdioRecord, transport: 'http', url: 'https://mcp.linear.app/mcp' }),
    ).toBe('https://mcp.linear.app/mcp');
  });

  it('names the host an address connector talks to', () => {
    expect(
      connectorDestination({
        ...stdioRecord,
        transport: 'http',
        url: 'https://mcp.linear.app/mcp',
      }),
    ).toBe('mcp.linear.app');
    // A half-typed address is echoed, since an empty destination would say the traffic goes
    // nowhere.
    expect(connectorDestination({ ...stdioRecord, transport: 'http', url: 'not a url' })).toBe(
      'not a url',
    );
  });
});

describe('the opener may stand outside the card (2026-09-19)', () => {
  function HeadedPanel({ handle }: { handle: FileSystemDirectoryHandle | null }) {
    const store = useVaultConnectors(handle);
    const opener = useRef<HTMLButtonElement | null>(null);
    const [request, setRequest] = useState(0);
    return (
      <>
        <button
          type="button"
          ref={opener}
          data-testid="heading-add-open"
          onClick={() => setRequest((n) => n + 1)}
        >
          add
        </button>
        <ConnectorsPanel
          handle={handle}
          store={store}
          addOpenRequest={request}
          externalAddOpener={opener}
          openFolderAction={<button type="button" data-testid="connectors-open-vault">open</button>}
        />
      </>
    );
  }

  it('with an external opener the listed card draws none of its own, and the request opens the dialog', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<HeadedPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-list')).toBeInTheDocument());
    // The Agents MCP tab puts the press in the group heading.
    expect(screen.queryByTestId('connectors-add-open')).toBeNull();
    expect(screen.queryByTestId('connectors-add-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('heading-add-open'));
    await waitFor(() => expect(screen.getByTestId('connectors-add-dialog')).toBeInTheDocument());
  });

  it('the empty state keeps its own indigo ask even with an external opener — that ask is the card', async () => {
    const vault = fakeVault(seeded());
    draw(<HeadedPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument();
  });
});
