// Static package-manifest readers: `setup.py`, `pyproject.toml`, `package.json` and
// `Cargo.toml`. Everything here is pure text analysis with no file access — the
// caller reads the bytes, these functions decide which declared facts are safe to
// quote as evidence — plus the TOML and Python lexing helpers they share.

import {
  CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
  CARGO_MANIFEST_MAX_FEATURES,
  CARGO_MANIFEST_MAX_FEATURE_VALUES,
  CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  CARGO_PACKAGE_EVIDENCE_FIELDS,
  NODE_PACKAGE_DEPENDENCY_LIMIT,
  NODE_PACKAGE_DESCRIPTION_MAX_LENGTH,
  NODE_PACKAGE_EXPORT_LIMIT,
  NODE_PACKAGE_SCRIPT_LIMIT,
  SEMANTIC_EVIDENCE_MAX_EXCERPT,
} from './constants.mjs';

export function extractPythonSetupPackageContract(text) {
  const packageFields = new Map();
  let insideSetupCall = false;
  let nesting = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripPythonComment(rawLine).trim();
    if (!insideSetupCall) {
      if (!/^(?:setup|setuptools\.setup)\s*\(\s*$/.test(line)) continue;
      insideSetupCall = true;
      nesting = 1;
      continue;
    }
    const staticField = line.match(
      /^(name|description|python_requires)\s*=\s*(['"])(.*?)\2\s*,?$/,
    );
    if (staticField) packageFields.set(staticField[1], staticField[3]);
    nesting += pythonDelimiterDelta(line);
    if (nesting <= 0) break;
  }
  const packageName = packageFields.get('name');
  if (!packageName) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: setup.py has no static setup name',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    packageFields.get('description')
      ? `Description: ${truncateCargoValue(
          packageFields.get('description'),
          CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
        )}`
      : null,
    packageFields.get('python_requires')
      ? `Python: ${truncateCargoValue(
          packageFields.get('python_requires'),
          CARGO_MANIFEST_MAX_TOKEN_LENGTH,
        )}`
      : null,
  ].filter(Boolean);
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: ['Package contract'],
    excerpt: details.join('. ').slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT),
    riskText: [...packageFields.values()].join('\n'),
  };
}

export function extractPythonPyprojectPackageContract(text) {
  const projectFields = new Map();
  let section = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    if (section !== 'project') continue;
    const assignment = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const key = normalizeTomlKey(assignment[1]);
    if (!['name', 'description', 'requires-python'].includes(key)) continue;
    const value = staticTomlString(assignment[2]);
    if (value !== null) projectFields.set(key, value);
  }
  const packageName = projectFields.get('name');
  if (!packageName) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: pyproject.toml has no static project name',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    projectFields.get('description')
      ? `Description: ${truncateCargoValue(
        projectFields.get('description'),
        CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
      )}`
      : null,
    projectFields.get('requires-python')
      ? `Python: ${truncateCargoValue(
        projectFields.get('requires-python'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
  ].filter(Boolean);
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: ['Package contract'],
    excerpt: details.join('. ').slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT),
    riskText: [...projectFields.values()].join('\n'),
  };
}

export function extractNodePackageContract(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: `package-contract-skip: malformed package.json: ${error.message}`,
    };
  }
  const packageName = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
  const description = typeof parsed?.description === 'string'
    ? parsed.description.replace(/\s+/g, ' ').trim()
    : '';
  if (!packageName || !description) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: workspace package.json requires static name and description',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const visibleDescription = truncateCargoValue(
    description,
    NODE_PACKAGE_DESCRIPTION_MAX_LENGTH,
  );
  const publicExports = collectNodePublicExportKeys(parsed.exports);
  const scripts = collectStaticManifestKeys(parsed.scripts, NODE_PACKAGE_SCRIPT_LIMIT);
  const dependencies = collectStaticManifestKeys(
    parsed.dependencies,
    NODE_PACKAGE_DEPENDENCY_LIMIT,
    isPackageDependencyName,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    `Description: ${visibleDescription}`,
    publicExports.length > 0 ? `Exports: ${publicExports.join(', ')}` : null,
    scripts.length > 0 ? `Scripts: ${scripts.join(', ')}` : null,
    dependencies.length > 0 ? `Dependencies: ${dependencies.join(', ')}` : null,
  ].filter(Boolean);
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: ['Package contract'],
    excerpt: details.join('. ').slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT),
    riskText: `${packageName}\n${description}`,
  };
}

function staticTomlString(value) {
  const trimmed = String(value).trim();
  if (trimmed.length < 2) return null;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return null;
  const body = trimmed.slice(1, -1);
  return /[\r\n]/.test(body) ? null : body;
}

function collectNodePublicExportKeys(exports) {
  if (typeof exports === 'string') {
    return isSafeNodeExportTarget(exports) ? ['.'] : [];
  }
  if (!exports || typeof exports !== 'object' || Array.isArray(exports)) return [];
  const subpathKeys = Object.keys(exports)
    .filter((key) => key === '.' || /^\.\/[A-Za-z0-9@._/-]+$/.test(key))
    .sort();
  if (subpathKeys.length === 0) {
    return collectNodeExportTargets(exports).some(isSafeNodeExportTarget) ? ['.'] : [];
  }
  return subpathKeys
    .filter((key) => collectNodeExportTargets(exports[key]).some(isSafeNodeExportTarget))
    .slice(0, NODE_PACKAGE_EXPORT_LIMIT);
}

function collectNodeExportTargets(value, targets = []) {
  if (typeof value === 'string') {
    targets.push(value);
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const nested of Object.values(value)) collectNodeExportTargets(nested, targets);
  }
  return targets;
}

function isSafeNodeExportTarget(value) {
  if (typeof value !== 'string' || !value.startsWith('./') || value.includes('\\')) {
    return false;
  }
  return !value.split('/').some((segment) => segment === '..' || segment.length === 0 && value !== './');
}

function collectStaticManifestKeys(value, limit, isAllowed = isSafeManifestKey) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value)
    .filter((key) => isAllowed(key))
    .sort()
    .slice(0, limit);
}

function isSafeManifestKey(value) {
  return /^[A-Za-z0-9@._:/-]{1,100}$/.test(value);
}

function isPackageDependencyName(value) {
  return /^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value);
}

function stripPythonComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (character === '#' && quote === null) return line.slice(0, index);
  }
  return line;
}

function pythonDelimiterDelta(line) {
  let quote = null;
  let escaped = false;
  let delta = 0;
  for (const character of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (quote) continue;
    if (character === '(' || character === '[' || character === '{') delta += 1;
    if (character === ')' || character === ']' || character === '}') delta -= 1;
  }
  return delta;
}

export function extractCargoPackageContract(text) {
  const packageFields = new Map();
  const features = [];
  let section = '';
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = stripTomlComment(lines[lineIndex]).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const assignment = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const key = normalizeTomlKey(assignment[1]);
    const packageEvidenceField =
      section === 'package' && CARGO_PACKAGE_EVIDENCE_FIELDS.has(key);
    let assignmentValue = assignment[2];
    if (
      section === 'features' &&
      assignmentValue.trimStart().startsWith('[')
    ) {
      while (
        !isBalancedTomlFragment(assignmentValue) &&
        lineIndex + 1 < lines.length
      ) {
        lineIndex += 1;
        assignmentValue += ` ${stripTomlComment(lines[lineIndex]).trim()}`;
      }
    }
    if (packageEvidenceField) {
      const staticValue = isBalancedTomlFragment(assignmentValue)
        ? staticTomlString(assignmentValue)
        : null;
      if (key === 'name' && staticValue === null) {
        return {
          title: null,
          headings: [],
          excerpt: '',
          skipReason: 'package-contract-skip: root Cargo.toml has no static package name',
        };
      }
      if (staticValue !== null) packageFields.set(key, staticValue);
      continue;
    }
    if (section === 'features' && !isBalancedTomlFragment(assignmentValue)) {
      return {
        title: null,
        headings: [],
        excerpt: '',
        skipReason: 'package-contract-skip: malformed Cargo.toml package/features contract',
      };
    }
    if (section === 'features') {
      features.push({
        name: key,
        values: [...assignmentValue.matchAll(/["']([^"']+)["']/g)]
          .map((match) => match[1]),
      });
    }
  }
  const packageName = packageFields.get('name');
  if (!packageName) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: root Cargo.toml has no [package] table',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    packageFields.get('description')
      ? `Description: ${truncateCargoValue(
        packageFields.get('description'),
        CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
      )}`
      : null,
    packageFields.get('version')
      ? `Version: ${truncateCargoValue(
        packageFields.get('version'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
    packageFields.get('edition')
      ? `Edition: ${truncateCargoValue(
        packageFields.get('edition'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
    packageFields.get('rust-version')
      ? `Rust version: ${truncateCargoValue(
        packageFields.get('rust-version'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
  ].filter(Boolean);
  const visibleFeatures = features
    .slice(0, CARGO_MANIFEST_MAX_FEATURES)
    .map((feature) => ({
      name: truncateCargoValue(feature.name, CARGO_MANIFEST_MAX_TOKEN_LENGTH),
      values: feature.values
        .slice(0, CARGO_MANIFEST_MAX_FEATURE_VALUES)
        .map((value) =>
          truncateCargoValue(value, CARGO_MANIFEST_MAX_TOKEN_LENGTH)
        ),
      omittedValues: Math.max(
        0,
        feature.values.length - CARGO_MANIFEST_MAX_FEATURE_VALUES,
      ),
    }));
  const excerpt = cargoPackageContractExcerpt(
    details,
    visibleFeatures,
    features.length,
  );
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: features.length > 0
      ? ['Package contract', 'Features']
      : ['Package contract'],
    excerpt,
    riskText: [
      ...packageFields.values(),
      ...features.flatMap((feature) => [feature.name, ...feature.values]),
    ].join('\n'),
  };
}

function cargoPackageContractExcerpt(details, candidateFeatures, totalFeatures) {
  const visibleFeatures = [...candidateFeatures];
  while (true) {
    const featureRows = visibleFeatures.map((feature) => {
      const values = feature.values.join(', ') || '(empty)';
      const suffix = feature.omittedValues > 0
        ? ` (+${feature.omittedValues} values omitted)`
        : '';
      return `${feature.name} -> ${values}${suffix}`;
    });
    const omittedFeatures = Math.max(0, totalFeatures - visibleFeatures.length);
    const parts = [
      ...details,
      featureRows.length > 0 ? `Features: ${featureRows.join('; ')}` : null,
      omittedFeatures > 0
        ? `Feature declarations omitted: ${omittedFeatures}`
        : null,
    ].filter(Boolean);
    const excerpt = parts.join('. ');
    if (
      excerpt.length <= SEMANTIC_EVIDENCE_MAX_EXCERPT ||
      visibleFeatures.length === 0
    ) {
      return excerpt.slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT);
    }
    visibleFeatures.pop();
  }
}

function truncateCargoValue(value, maxLength) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (character === '#' && quote === null) return line.slice(0, index);
  }
  return line;
}

function normalizeTomlKey(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isBalancedTomlFragment(value) {
  const stack = [];
  let quote = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (quote) continue;
    if (character === '[' || character === '{') stack.push(character);
    if (character === ']' || character === '}') {
      const expected = character === ']' ? '[' : '{';
      if (stack.pop() !== expected) return false;
    }
  }
  return quote === null && stack.length === 0;
}
