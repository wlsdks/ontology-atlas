import { EXPECTED_TOOLS } from '../tools-list/inventory.mjs';

export function initializeInstructionsFailure(response) {
  const instructions = response?.result?.instructions;
  if (typeof instructions !== 'string' || instructions.length < 200) {
    return 'initialize instructions missing or too short';
  }

  const missingTool = EXPECTED_TOOLS.find((toolName) => !new RegExp(`\\b${toolName}\\b`).test(instructions));
  if (missingTool) {
    return `initialize instructions missing tool inventory entry: ${missingTool}`;
  }

  // The instructions carry only what a first call needs: the card, the write
  // sequence, where the long rules are, and the read-before-rename habit. Each
  // tool's own contract (dry-run, mtime, strict input) is its description.
  // Each clause is one line, so the tool inventory cannot satisfy it by accident.
  const required = [
    ['construction card', /## Construction card/],
    ['build write sequence', /add_concepts[^\n]*add_relations[^\n]*validate_vault[^\n]*connect_project_source[^\n]*finalize_project_meaning/],
    ['long-rule guide pointer', /connection_info\(\{guide:"construction"\}\)[^\n]*write_safety/],
    ['backlinks before rename guidance', /before a rename, merge, or delete[^\n]*find_backlinks/],
    ['read-only first-contact diagnosis', /workspace_brief[^\n]*validate_vault/],
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

export function initializeToolInventoryFailure(response, tools) {
  const instructions = response?.result?.instructions;
  if (typeof instructions !== 'string') return 'initialize tool inventory missing instructions';
  if (!Array.isArray(tools) || tools.length === 0) {
    return 'initialize tool inventory cannot compare an empty tools/list';
  }

  const section = instructions.match(
    /## Tool inventory \((\d+) tools = read (\d+) \+ write (\d+)\)\s+([\s\S]*?)(?=\n## )/,
  );
  if (!section) return 'initialize tool inventory section missing or malformed';

  const parseNames = (label) => {
    const line = section[4].match(new RegExp(`^\\*\\*${label}\\*\\*\\s+—\\s+(.+)$`, 'm'));
    if (!line) return null;
    return [...line[1].matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1]);
  };
  const readNames = parseNames('read');
  const writeNames = parseNames('write');
  if (!readNames || !writeNames) return 'initialize tool inventory read/write lines missing';

  const total = Number(section[1]);
  const readCount = Number(section[2]);
  const writeCount = Number(section[3]);
  if (total !== readCount + writeCount) return 'initialize tool inventory header does not add up';
  if (readCount !== readNames.length || writeCount !== writeNames.length) {
    return 'initialize tool inventory counts do not match listed names';
  }
  if (new Set([...readNames, ...writeNames]).size !== readNames.length + writeNames.length) {
    return 'initialize tool inventory contains duplicate names';
  }

  const expectedRead = tools
    .filter((tool) => tool?.annotations?.readOnlyHint === true)
    .map((tool) => tool.name)
    .sort();
  const expectedWrite = tools
    .filter((tool) => tool?.annotations?.readOnlyHint !== true)
    .map((tool) => tool.name)
    .sort();
  if (total !== tools.length || readCount !== expectedRead.length || writeCount !== expectedWrite.length) {
    return `initialize tool inventory count mismatch — initialize ${total}/${readCount}/${writeCount}, tools/list ${tools.length}/${expectedRead.length}/${expectedWrite.length}`;
  }

  const sameNames = (actual, expected) => (
    actual.length === expected.length && [...actual].sort().every((name, index) => name === expected[index])
  );
  if (!sameNames(readNames, expectedRead)) return 'initialize tool inventory read names differ from tools/list';
  if (!sameNames(writeNames, expectedWrite)) return 'initialize tool inventory write names differ from tools/list';
  return null;
}
