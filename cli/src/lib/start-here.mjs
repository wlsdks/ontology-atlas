/**
 * What to show when somebody types `atlas` with nothing after it.
 *
 * ⚠️ **Why** (owner, 2026-08-25: *"if we are doing this, make it much better than it is now"*). Bare
 * `ontology-atlas` printed all 56 commands. That is a reference, and a reference is the right answer
 * to *"what else can this do"* — it is the wrong answer to *"I just installed this, now what."* The
 * person who types the bare command has told you they do not know the next word, and answering with
 * fifty-six of them puts the work back on them.
 *
 * So the bare command reads the situation and names **the few things that make sense from here**.
 * The full list stays one flag away, because the reference is genuinely useful once you know what
 * you are looking for.
 *
 * This module is pure: it takes facts and returns rows. The caller does the filesystem work, so the
 * decision of *what to suggest* can be tested without a disk.
 */

/**
 * @typedef {object} Situation
 * @property {boolean} inVault      the working directory is itself an ontology folder
 * @property {string|null} nearbyVault  an ontology folder found just below (e.g. `./atlas`), or null
 * @property {boolean} looksLikeCode    the working directory has source code in it
 * @property {number} conceptCount      nodes in the vault, when there is one
 * @property {boolean} shimInstalled    `atlas` is already on PATH
 */

/**
 * Ordered next steps. First row is the one most likely to be right.
 *
 * The ordering rule is *what is missing*, not *what is impressive*: somebody standing in a codebase
 * with no ontology needs one, somebody standing in an empty ontology needs content, and somebody
 * with a full one needs to look at it. Suggesting `query` to a person with zero nodes is the CLI
 * equivalent of the empty map offering "browse concepts".
 */
export function startHereRows(situation) {
  const {
    inVault = false,
    nearbyVault = null,
    looksLikeCode = false,
    conceptCount = 0,
    shimInstalled = true,
  } = situation ?? {};

  /** @type {Array<{ command: string, why: string }>} */
  const rows = [];

  if (!inVault && !nearbyVault) {
    if (looksLikeCode) {
      // The headline case: a developer standing in their own repository.
      rows.push({ command: 'atlas bootstrap .', why: 'read this codebase and propose an ontology' });
      rows.push({ command: 'atlas init atlas', why: 'start an empty ontology folder here' });
    } else {
      rows.push({ command: 'atlas init atlas', why: 'start an ontology folder here' });
    }
    rows.push({ command: 'atlas --help', why: 'every command' });
    return rows;
  }

  const vaultArg = inVault ? '' : ` ${nearbyVault}`;

  if (conceptCount === 0) {
    rows.push({ command: `atlas bootstrap .`, why: 'read the code and fill this ontology' });
    rows.push({ command: `atlas add domain <slug>${vaultArg}`, why: 'write the first one by hand' });
  } else {
    rows.push({ command: `atlas overview${vaultArg}`, why: 'what is in here' });
    rows.push({ command: `atlas health${vaultArg}`, why: 'what needs attention' });
    rows.push({ command: `atlas agent-brief${vaultArg}`, why: 'hand this to an AI agent' });
  }
  rows.push({ command: 'atlas --help', why: 'every command' });
  if (!shimInstalled) {
    rows.push({ command: 'atlas install-shim', why: 'run `atlas` from anywhere' });
  }
  return rows;
}

/** One line naming where the person is, so the suggestions below it are not floating. */
export function startHereContext(situation) {
  const { inVault = false, nearbyVault = null, looksLikeCode = false, conceptCount = 0 } =
    situation ?? {};
  if (inVault) {
    return conceptCount === 0
      ? 'You are in an ontology folder, and it is empty.'
      : `You are in an ontology folder with ${conceptCount} concept${conceptCount === 1 ? '' : 's'}.`;
  }
  if (nearbyVault) return `There is an ontology folder here: ${nearbyVault}`;
  if (looksLikeCode) return 'This looks like a codebase with no ontology yet.';
  return 'No ontology folder here yet.';
}
