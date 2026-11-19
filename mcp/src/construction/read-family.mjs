/**
 * The family a symbol read belongs to, as one plain line on the read: how many
 * members the repository holds and how many this session has read. A family is
 * either the declarations that carry the read function's or method's name
 * under the folder holding its workspace package, else under its own folder
 * (each plugin's `apply`, each broker's `Presence`, each transform's
 * `__call__`), or a family row the survey lists whose members include the read
 * symbol (one class per file in a folder). A builder who read one member then
 * knows, where the sentence is written, that "every" would speak for members it
 * has not read. Nothing refuses: the line is a fact beside the read.
 *
 * The cost is one probe of the cached declarations per read call, for the
 * names its rows read.
 */

import { posix } from 'node:path';

import { repoText } from '../analyze/repo-text.mjs';
import { declarationsNamed } from '../evidence-search/declaration-index.mjs';

const CALLABLE = new Set(['function', 'method']);
// Members named in the line; the rest are counted.
const SHOWN = 3;

const lastSegment = (name) => String(name).split('.').pop();
const keyOf = (row) => `${row.path}\0${row.line}`;

/** The folder a read's family spans: the one holding its workspace package, else its own; none at the root. */
function familyRoot(path, packages) {
  let holder = null;
  for (const folder of packages) {
    if (folder !== '.' && path.startsWith(`${folder}/`) && (!holder || folder.length > holder.length)) holder = folder;
  }
  const root = posix.dirname(holder ?? path);
  return root === '.' || root === '' ? null : root;
}

/** Whether this session has served the member: a range from its declaration line on, or a read of it by name. */
function served(reads, member) {
  return (reads?.get(member.path) ?? []).some((range) => range.startLine <= member.line && member.line <= range.endLine
    && (range.endLine > member.line || (typeof range.symbol === 'string' && lastSegment(range.symbol) === lastSegment(member.name))));
}

const label = (member) => repoText(member.owner ? `${member.owner}.${lastSegment(member.name)}` : member.name, 80);

function line({ members, what, reads }) {
  const read = members.filter((member) => served(reads, member)).length;
  const shown = members.slice(0, SHOWN).map((member) => `${label(member)} ${repoText(`${member.path}:L${member.line}`)}`).join(', ');
  const more = members.length > SHOWN ? ` and ${members.length - SHOWN} more` : '';
  return `This family has ${members.length} members: ${what} (${shown}${more}). This session has read ${read} of them; a sentence about the family says "${read} of ${members.length} read" or speaks only for the member${read === 1 ? '' : 's'} read, and what the others do is an Uncertainty line.`;
}

/**
 * Adds `family`, one plain line, to each symbol read in the packet that belongs
 * to a family of two or more members.
 *
 * @param {object} packet a `sourceEvidence:v1` packet, changed in place
 * @param {{ repoRoot: string, collection: object, survey?: object, reads?: Map<string, object[]> }} context
 */
export function noteReadFamilies(packet, { repoRoot, collection, survey, reads }) {
  const rows = (packet?.rows ?? []).filter((row) => row?.status === 'read' && typeof row.symbol === 'string' && row.actualRange);
  if (rows.length === 0 || !repoRoot || !collection) return packet;
  const files = collection.files?.filter((file) => file.class === 'product');
  const packages = (collection.members ?? []).map((member) => member.path).filter((path) => typeof path === 'string');
  const families = (survey?.abilities ?? []).filter((ability) => ability.kind === 'family' && Array.isArray(ability.members));
  const names = new Set(rows.map((row) => lastSegment(row.symbol)));
  for (const family of families) {
    if (rows.some((row) => posix.dirname(row.path) === family.path && family.members.includes(lastSegment(row.symbol)))) for (const member of family.members) names.add(member);
  }
  const named = declarationsNamed(repoRoot, names, files ? { files } : {});
  for (const row of rows) {
    const own = (candidate) => candidate.path === row.path && row.actualRange.startLine <= candidate.line && candidate.line <= row.actualRange.endLine;
    const name = lastSegment(row.symbol);
    const root = familyRoot(row.path, packages);
    const seen = new Set();
    const sameName = root
      ? (named.get(name) ?? []).filter((member) => CALLABLE.has(member.kind) && member.path.startsWith(`${root}/`) && !seen.has(keyOf(member)) && seen.add(keyOf(member)))
      : [];
    if (sameName.length >= 2 && sameName.some(own)) {
      row.family = line({ members: sameName, what: `\`${repoText(name, 80)}\` is declared ${sameName.length} times under ${repoText(root)}/`, reads });
      continue;
    }
    const family = families.find((candidate) => posix.dirname(row.path) === candidate.path && candidate.members.includes(name));
    if (!family) continue;
    const members = family.members.map((member) => (named.get(member) ?? []).find((candidate) => posix.dirname(candidate.path) === family.path)).filter(Boolean);
    if (members.length >= 2) row.family = line({ members, what: `the ${repoText(family.path)} family the survey lists`, reads });
  }
  return packet;
}
