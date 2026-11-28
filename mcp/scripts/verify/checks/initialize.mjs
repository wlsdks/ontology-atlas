/** A host may keep only the first 2,048 characters of the instructions; the whole string must fit. */
const INSTRUCTIONS_WINDOW = 2048;

export function initializeInstructionsFailure(response) {
  const instructions = response?.result?.instructions;
  if (typeof instructions !== 'string' || instructions.length < 200) {
    return 'initialize instructions missing or too short';
  }
  if (instructions.length > INSTRUCTIONS_WINDOW) {
    return `initialize instructions run ${instructions.length} characters, past the ${INSTRUCTIONS_WINDOW} a host may keep`;
  }

  // The instructions carry the identity line, the construction card and one line to
  // the guides. `tools/list` is the tool inventory and each tool's description its contract.
  const required = [
    ['construction card', /## Construction card/],
    ['build write sequence', /add_concepts[^\n]*add_relations[^\n]*validate_vault[^\n]*connect_project_source[^\n]*finalize_project_meaning/],
    ['long-rule guide pointer', /connection_info\(\{guide\}\)/],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(instructions)) {
      return `initialize instructions missing ${label}`;
    }
  }
  // An app session cannot finish the bulk evaluator route, so first contact never sends an agent there.
  if (/qualification|writePlan/.test(instructions)) {
    return 'initialize instructions name the bulk qualification route';
  }
  return null;
}
