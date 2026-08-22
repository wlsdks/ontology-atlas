import { existsSync, readFileSync } from 'node:fs';
import { visit } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { writeFileAtomically } from './atomic-write.mjs';

export function repairMcpJsonText(text, expected) {
  try {
    if (hasDuplicateJsonProperty(text)) return { ok: false };
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false };
    }
    if (parsed.mcpServers !== undefined &&
        (!parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers))) {
      return { ok: false };
    }
    const hadAtlas = Boolean(parsed.mcpServers?.['ontology-atlas']);
    parsed.mcpServers = {
      ...(parsed.mcpServers ?? {}),
      'ontology-atlas': expected.mcpServers['ontology-atlas'],
    };
    return {
      ok: true,
      text: JSON.stringify(parsed, null, 2) + '\n',
      action: hadAtlas ? 'rebound' : 'merged',
      message: hadAtlas
        ? 'rebound only mcpServers.ontology-atlas; preserved other entries'
        : 'merged mcpServers.ontology-atlas; preserved other entries',
    };
  } catch {
    return { ok: false };
  }
}

export function repairCodexConfigText(text, expectedText) {
  let parsed;
  try {
    parsed = parseToml(text);
  } catch {
    return { ok: false };
  }
  const sections = tomlSectionRanges(text);
  const serverSections = sections.filter((section) => section.name === 'mcp_servers.ontology-atlas');
  const envSections = sections.filter((section) => section.name === 'mcp_servers.ontology-atlas.env');
  const semanticAtlas = parsed?.mcp_servers?.['ontology-atlas'];
  if (semanticAtlas !== undefined && serverSections.length === 0) return { ok: false };
  if (serverSections.length > 1 || envSections.length > 1) return { ok: false };
  if (serverSections.length !== envSections.length) return { ok: false };
  if (serverSections.length === 1) {
    const ranges = [serverSections[0], envSections[0]].sort((a, b) => a.start - b.start);
    let repaired = text;
    for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
      repaired = repaired.slice(0, range.start) + repaired.slice(range.end);
    }
    const insertion = ranges[0].start;
    const prefix = repaired.slice(0, insertion);
    const suffix = repaired.slice(insertion);
    const before = prefix.length === 0 || prefix.endsWith('\n\n') ? '' : prefix.endsWith('\n') ? '\n' : '\n\n';
    const after = suffix.length === 0 || suffix.startsWith('\n') ? '' : '\n';
    return {
      ok: true,
      text: `${prefix}${before}${expectedText}${after}${suffix}`,
      action: 'rebound',
      message: 'rebound only mcp_servers.ontology-atlas sections; preserved other sections',
    };
  }
  const separator = text.length === 0 || text.endsWith('\n') ? '' : '\n';
  return {
    ok: true,
    text: `${text}${separator}${text.length === 0 ? '' : '\n'}${expectedText}`,
    action: 'merged',
    message: 'merged mcp_servers.ontology-atlas sections; preserved other sections',
  };
}

/**
 * Writes a config file without a torn window.
 *
 * There is one implementation, `atomic-write.mjs`. As the 2026-08-16 review found,
 * this repository was writing **only config files** safely and not the user's
 * markdown; keeping two copies of the same implementation guarantees that next
 * time only one of them gets fixed.
 */
export function writeTextAtomically(path, text) {
  writeFileAtomically(path, text);
}

export function writeCurrentMcpMergeTemplate(path, expected) {
  const expectedText = JSON.stringify(expected, null, 2) + '\n';
  if (!existsSync(path)) {
    writeTextAtomically(path, expectedText);
    return { path, action: 'example-written' };
  }
  const repaired = repairMcpJsonText(readFileSync(path, 'utf8'), expected);
  if (repaired.ok) {
    writeTextAtomically(path, repaired.text);
    return { path, action: 'example-refreshed' };
  }
  const sidecarPath = currentTemplateSidecar(path);
  writeTextAtomically(sidecarPath, expectedText);
  return { path: sidecarPath, action: 'current-example-written' };
}

export function writeCurrentCodexMergeTemplate(path, expectedText) {
  if (!existsSync(path)) {
    writeTextAtomically(path, expectedText);
    return { path, action: 'example-written' };
  }
  const repaired = repairCodexConfigText(readFileSync(path, 'utf8'), expectedText);
  if (repaired.ok) {
    writeTextAtomically(path, repaired.text);
    return { path, action: 'example-refreshed' };
  }
  const sidecarPath = currentTemplateSidecar(path);
  writeTextAtomically(sidecarPath, expectedText);
  return { path: sidecarPath, action: 'current-example-written' };
}

function currentTemplateSidecar(path) {
  return path.endsWith('.example')
    ? `${path.slice(0, -'.example'.length)}.ontology-atlas-current.example`
    : `${path}.ontology-atlas-current.example`;
}

function tomlSectionRanges(text) {
  const headings = [...text.matchAll(/^\[([^\]]+)\]\s*(?:#.*)?$/gm)].map((match) => ({
    name: normalizeTomlSectionName(match[1]),
    start: match.index,
  }));
  return headings.map((heading, index) => ({
    ...heading,
    end: headings[index + 1]?.start ?? text.length,
  }));
}

function normalizeTomlSectionName(name) {
  const match = name.match(
    /^\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:ontology-atlas|"ontology-atlas"|'ontology-atlas')(?:\s*\.\s*(env|"env"|'env'))?\s*$/,
  );
  if (!match) return name;
  return match[1]
    ? 'mcp_servers.ontology-atlas.env'
    : 'mcp_servers.ontology-atlas';
}

function hasDuplicateJsonProperty(text) {
  const seen = new Set();
  let duplicate = false;
  visit(text, {
    onObjectProperty(property, _offset, _length, _line, _character, pathSupplier) {
      const key = JSON.stringify([...pathSupplier(), property]);
      if (seen.has(key)) duplicate = true;
      seen.add(key);
    },
  });
  return duplicate;
}
