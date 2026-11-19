/**
 * Server-side only: the message paths the gateway pages' client tree reads (`/download`, `/guide`,
 * `/changelog`, mounted by `app/(gateway)/[locale]/layout.tsx`).
 *
 * The client provider serialises its `messages` into every statically exported page, so handing it
 * the whole catalog put all of the workbench's copy into each public page's HTML. A path is a
 * namespace as `useTranslations` names it (`download`, `topology.startSteps.analyze`): the client
 * receives that subtree and nothing beside it.
 *
 * `gateway-messages.test.ts` walks the import graph of those pages and fails when this list and the
 * namespaces their client modules ask for differ in either direction.
 */
export const GATEWAY_MESSAGE_PATHS = [
  'agentConnect',
  'agents.models',
  'download',
  'featuresMisc.vaultDiffToaster',
  'firstRun',
  'footer',
  'gatewayNav',
  'harness',
  'kinds',
  'locale',
  'moru',
  'nav',
  'navRail',
  'topology.startSteps.analyze',
] as const;

type MessageTree = Record<string, unknown>;

/**
 * Copies only the subtrees `paths` name. A path missing from `messages` is skipped, so a locale
 * that lacks a key falls back exactly as it does with the full catalog.
 */
export function pickMessagePaths(messages: MessageTree, paths: readonly string[]): MessageTree {
  const out: MessageTree = {};
  const covered = (dotted: string) => paths.some((other) => dotted.startsWith(`${other}.`));
  for (const dotted of paths) {
    // An ancestor already carries this subtree; descending into it would write into the catalog.
    if (covered(dotted)) continue;
    const parts = dotted.split('.');
    let source: unknown = messages;
    for (const part of parts) {
      source = source && typeof source === 'object' ? (source as MessageTree)[part] : undefined;
    }
    if (source === undefined) continue;
    let target = out;
    for (const part of parts.slice(0, -1)) {
      const next = target[part];
      target = (target[part] = next && typeof next === 'object' ? next : {}) as MessageTree;
    }
    target[parts[parts.length - 1]!] = source;
  }
  return out;
}
