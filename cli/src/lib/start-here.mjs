/**
 * What to show when somebody types bare `atlas`: the few next steps that fit their situation, since typing
 * the bare word says they do not know the next one. The full list stays behind `--help`. Pure: facts in, rows out.
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
 * Ordered next steps, most likely first, ranked by what is missing: a codebase with no ontology needs
 * one, an empty ontology needs content, a full one needs looking at.
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
