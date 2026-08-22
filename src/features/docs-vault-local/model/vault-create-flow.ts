/**
 * The decision logic of the "create a new vault" card, extracted as pure functions so it can be tested.
 *
 * No separate "create" pipeline is built. This is only the composition of the existing `open()`
 * (folder selection) followed by the existing `scaffoldOntology()` (seeding five starter md files plus
 * the agent config — the same action as `/docs`'s OntologyStarterCta), keeping one source of truth.
 *
 * Why it lives at the features layer: `FirstRunPage` (desktop first run) and `FirstRunChooser` (the
 * web's no-vault first screen) both reuse this composition as-is, so it moved one layer down to avoid
 * a same-layer cross-import between two views (FSD).
 */
export function shouldScaffoldAfterOpen(args: {
  /** Did the user start `open` from the "create a new vault" card? */
  createIntent: boolean;
  /** useLocalVault().status */
  status: string;
  /** The opened manifest's document count; null when there is no manifest. */
  docCount: number | null;
}): boolean {
  return args.createIntent && args.status === 'loaded' && args.docCount === 0;
}

/**
 * When the create intent must be folded away — once `open` has finished (success, cancel, or failure).
 * The intent is held only during 'opening' and 'loading'.
 */
export function shouldClearCreateIntent(status: string): boolean {
  return status !== 'opening' && status !== 'loading';
}
