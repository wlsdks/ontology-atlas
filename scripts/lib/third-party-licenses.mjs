import fs from 'node:fs';
import path from 'node:path';

import { electLicense } from './license-policy.mjs';
import { listLicenseFiles } from './third-party-inventory.mjs';

const RULE = '='.repeat(80);
const DIVIDER = '-'.repeat(80);
const FILE_BREAK = '- - - - - - - - - -';

const FILE_HINTS = [
  ['Apache-2.0', /apache/i],
  ['MIT', /mit/i],
  ['BSD', /bsd/i],
  ['Zlib', /zlib/i],
  ['Unlicense', /unlicense/i],
  ['ISC', /isc/i],
  ['CC0-1.0', /cc0/i],
  ['Unicode-3.0', /unicode/i],
  ['MPL-2.0', /mpl/i],
];

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function normalizeLicenseText(text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/^\n+|\n+$/g, '');
}

function family(license) {
  const base = license.split(' WITH ')[0];
  return /BSD/.test(base) ? 'BSD' : base;
}

function hintsOf(fileName) {
  return FILE_HINTS.filter(([, pattern]) => pattern.test(fileName)).map(([hint]) => hint);
}

/** For `MIT OR Apache-2.0` used under MIT, the MIT file plus every file not named for one license. */
export function selectLicenseFiles(names, elected) {
  if (!elected) return names;
  const families = new Set(elected.map(family));
  const chosen = names.filter((name) => hintsOf(name).some((hint) => families.has(hint)));
  if (chosen.length === 0) return names;
  return names.filter((name) => hintsOf(name).length === 0 || chosen.includes(name));
}

/** `supplied` carries the text for a package that publishes none, keyed `<ecosystem> <name>`. */
export function packageLicenseText(pkg, supplied = new Map()) {
  const elected = electLicense(pkg.license).licenses;
  const label = elected ? elected.join(' AND ') : pkg.license;
  const texts = selectLicenseFiles(listLicenseFiles(pkg.dir), elected)
    .map((name) => normalizeLicenseText(fs.readFileSync(path.join(pkg.dir, name), 'utf8')))
    .filter(Boolean);
  const fallback = supplied.get(`${pkg.ecosystem} ${pkg.name}`);
  if (texts.length === 0 && fallback) texts.push(normalizeLicenseText(fallback));
  return {
    label,
    body: texts.length > 0 ? texts.join(`\n\n${FILE_BREAK}\n\n`) : `No license file is published with these packages; each declares ${label}.`,
  };
}

function usedBy(pkg) {
  return pkg.authors.length > 0 ? `${pkg.name} (${pkg.authors.join(', ')})` : pkg.name;
}

/** Packages that ship byte-identical license texts share one copy of the text. */
function groupLicenseTexts(packages, readText) {
  const groups = new Map();
  for (const pkg of packages) {
    const { label, body } = readText(pkg);
    const key = `${label}\0${body}`;
    if (!groups.has(key)) groups.set(key, { label, body, users: new Set() });
    groups.get(key).users.add(usedBy(pkg));
  }
  return [...groups.values()]
    .map((group) => ({ ...group, users: [...group.users].sort(compare) }))
    .sort((a, b) => compare(a.label, b.label) || compare(a.users[0], b.users[0]) || compare(a.body, b.body));
}

export function distinctNames(packages) {
  return [...new Set(packages.map((pkg) => pkg.name))].sort(compare);
}

function renderSection(number, { title, intro, packages }, readText) {
  const lines = [RULE, `${number}. ${title} (${distinctNames(packages).length})`, RULE, '', intro, ''];
  for (const group of groupLicenseTexts(packages, readText)) {
    lines.push(DIVIDER, `License: ${group.label}`, 'Used by:', ...group.users.map((user) => `  ${user}`), '', group.body, '');
  }
  return lines;
}

function renderAdapted(number, markers) {
  const lines = [RULE, `${number}. Adapted code (${markers.length})`, RULE, ''];
  if (markers.length === 0) {
    lines.push('No source file in this repository carries code adapted from a third party.', '');
    return lines;
  }
  lines.push('Functions adapted from third-party sources, each marked at the function itself.', '');
  for (const marker of markers) {
    lines.push(`${marker.path}`, `  Adapted from ${marker.url}`, `  License: ${marker.license}, © ${marker.holder}`, '');
  }
  return lines;
}

export function renderThirdPartyLicenses({ sections, adapted, readText }) {
  const contents = [
    ...sections.map((section, index) => `  ${index + 1}. ${section.title} (${distinctNames(section.packages).length})`),
    `  ${sections.length + 1}. Adapted code (${adapted.length})`,
  ];
  const lines = [
    'Third-party licenses for Ontology Atlas',
    '',
    'Ontology Atlas is licensed under the MIT License. The packages below are part of',
    'what it is built from, and their licenses ask that these texts travel with every',
    'copy. NOTICE.md, beside this file in the repository and in the desktop app,',
    'explains the licenses that ask for more than that.',
    '',
    'Each entry names the license a package is used under (the permissive choice when',
    'a package offers several), the packages that publish that exact text, and the',
    'text itself, including any NOTICE file a package ships.',
    '',
    'Generated by `pnpm notice:build`. Do not edit by hand.',
    '',
    'Contents',
    ...contents,
    '',
  ];
  sections.forEach((section, index) => lines.push(...renderSection(index + 1, section, readText)));
  lines.push(...renderAdapted(sections.length + 1, adapted));
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}
