// The sentence a coding agent needs and the MCP server cannot say.
//
// The server sends its own `instructions` at initialize, and they are good: they
// tell an agent which tool answers which question. What they cannot tell it is
// that *this* repository has a reviewed ontology, where it sits, or when reading
// it comes before reading code. That is a fact about one codebase, and it
// belongs in that codebase's own agent instructions.
//
// Atlas does not write it. `CLAUDE.md` and `AGENTS.md` are files the user — or
// their team, or another tool — wrote, and appending to them silently would make
// Atlas the second author of a document nobody asked it to co-write. So the
// scaffold prints the exact text and the person decides. Whether that should
// ever become automatic is an open question with its own record.

/** Relative path from the repository root to the vault, in POSIX form. */
function posix(relativePath) {
  return relativePath.split(/[\\/]/).filter(Boolean).join('/');
}

/**
 * Two paragraphs, no more. A briefing an agent has to scroll is a briefing it
 * summarises, and the point is the trigger — when to look — not a second copy of
 * the tool manual it already has.
 */
export function rootBriefing(vaultRelativePath) {
  const vault = posix(vaultRelativePath) || '.';
  return [
    '## Codebase ontology',
    '',
    `This repository keeps a reviewed ontology in \`${vault}/\` — what each part`,
    'is for, which responsibility owns it, what is deliberately excluded, and why.',
    'The `ontology-atlas` MCP server is already registered and answers from it.',
    '',
    '**Before unfamiliar work, orient from the ontology rather than from a file**',
    '**search.** Start with `query_ontology({operation:"workspace_brief"})`, then',
    '`get_concept({slug})` for whatever it points at. The source says what the',
    'code does; the vault says why the boundary is there, which grep cannot find.',
    '',
    'After a change that adds or moves meaning, record it through the same server',
    '(`add_concept`, `add_relation`, `patch_concept`) so the next session starts',
    'from what this one learned.',
  ].join('\n');
}

/** The same text, indented for a terminal block so it reads as one quoted unit. */
export function indentBriefing(text, indent = '       ') {
  return text.split('\n').map((line) => (line ? `${indent}${line}` : indent.trimEnd())).join('\n');
}
