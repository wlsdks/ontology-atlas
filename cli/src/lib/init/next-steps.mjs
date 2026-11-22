import { join } from 'node:path';
import { COLORS } from '../colors.mjs';

/** What `init --documents` prints once the documents folder exists. */
export function documentsNextSteps({ target }) {
  return `
${COLORS.green}${COLORS.bold}done${COLORS.reset}: documents folder scaffolded — ${COLORS.bold}sources/${COLORS.reset} for the files, ${COLORS.bold}wiki/${COLORS.reset} for the pages.

${COLORS.bold}Next steps:${COLORS.reset}

  ${COLORS.dim}1.${COLORS.reset} ${COLORS.bold}Put documents in:${COLORS.reset} copy PDFs, Word files, spreadsheets or text into ${COLORS.cyan}${join(target, 'sources')}${COLORS.reset}.
       ${COLORS.dim}Any format; the files are kept byte for byte and never edited.${COLORS.reset}

  ${COLORS.dim}2.${COLORS.reset} ${COLORS.bold}Open the folder in Ontology Atlas${COLORS.reset} and use ${COLORS.bold}Library${COLORS.reset}:
       ${COLORS.dim}Compile writes one page per document, every claim cited; Check the wiki reports${COLORS.reset}
       ${COLORS.dim}disagreements, stale claims and missing links. Every write stops at your permission card.${COLORS.reset}

  ${COLORS.dim}A map — domains, capabilities, elements — is not part of this folder. Run ${COLORS.bold}init${COLORS.reset} without${COLORS.reset}
  ${COLORS.dim}--documents on a code repository when you want one; the wiki stands on its own until then.${COLORS.reset}
`;
}

/** What `init` prints once the vault exists. */
export function vaultNextSteps({
  wiredFolders,
  wiredOpenWhich,
  codexSetupCommand,
  vaultIsRepoRoot,
  briefingSnippet,
}) {
  return `
${COLORS.green}${COLORS.bold}done${COLORS.reset}: vault scaffolded.

${COLORS.bold}Next steps:${COLORS.reset}

  ${COLORS.dim}1.${COLORS.reset} ${COLORS.bold}Edit project.md${COLORS.reset}: set your project's real name + description.

  ${COLORS.dim}2.${COLORS.reset} ${COLORS.bold}Open this folder in an AI agent${COLORS.reset}:
       ${COLORS.bold}Claude Code / Cursor${COLORS.reset}
       ${wiredFolders} a wired
       ${COLORS.bold}.mcp.json${COLORS.reset}. Open ${wiredOpenWhich}, restart the agent,
       and the ${COLORS.bold}ontology-atlas${COLORS.reset} tools appear (${COLORS.cyan}tools/list${COLORS.reset} names them).

       ${COLORS.bold}Codex${COLORS.reset}
       ${wiredFolders} a wired
       ${COLORS.bold}.codex/config.toml${COLORS.reset}. Open ${wiredOpenWhich} in Codex and restart it.
       Codex ignores a project-scoped ${COLORS.bold}.codex/config.toml${COLORS.reset} until that folder is
       ${COLORS.bold}trusted${COLORS.reset}; approve the trust prompt, then run ${COLORS.cyan}codex mcp list${COLORS.reset}
       from the folder and confirm ${COLORS.bold}ontology-atlas${COLORS.reset} appears before any write.
       For a global Codex config instead, run:
       ${COLORS.cyan}${codexSetupCommand}${COLORS.reset}
       ${COLORS.dim}Codex can also store MCP servers globally, so this is optional${COLORS.reset}
       ${COLORS.dim}when the repo-local config is enough.${COLORS.reset}

  ${COLORS.dim}3.${COLORS.reset} ${COLORS.bold}Build the map${COLORS.reset}: run ${COLORS.bold}/atlas-grow${COLORS.reset} in your agent. It proposes
       candidates with evidence and writes only the ones you pick.

  ${COLORS.dim}4.${COLORS.reset} ${COLORS.bold}Tell your agent the vault is here${COLORS.reset}${vaultIsRepoRoot ? ' (already done — this folder is the vault)' : ':'}${vaultIsRepoRoot ? '' : `
       The server hands every connected agent a manual for its tools. What it
       cannot say is that ${COLORS.bold}this${COLORS.reset} repository has a reviewed ontology, or when
       to read it. That sentence is yours to add, so paste this into your own
       ${COLORS.bold}CLAUDE.md${COLORS.reset} or ${COLORS.bold}AGENTS.md${COLORS.reset} — Atlas does not edit files you wrote:

${briefingSnippet}`}

  ${COLORS.dim}5.${COLORS.reset} ${COLORS.bold}See the graph${COLORS.reset} (optional, macOS app):
       Install the ontology-atlas macOS app from:
       ${COLORS.cyan}https://ontologyatlas.com/en/download/${COLORS.reset}
       Point its ${COLORS.bold}/docs${COLORS.reset} picker at this vault.

${COLORS.dim}AI agents and humans now share the same vault. Have fun.${COLORS.reset}
`;
}
