import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

const CONTRACT = 'rustFeatureConfigurationEvidence:v1';
const SOURCE_FILE_LIMIT = 5000;
const SOURCE_FILE_MAX_BYTES = 256 * 1024;
const REFERENCES_PER_FEATURE = 5;
const PACKAGE_LIMIT = 24;
const FEATURE_LIMIT = 48;
const DIRECT_MAPPING_LIMIT = 100;
const DIRECT_MAPPING_MAX_LENGTH = 512;
const WORKSPACE_MEMBER_LIMIT = 100;
const UNSUPPORTED_WORKSPACE_MEMBER_SAMPLE_LIMIT = 50;
const UNSUPPORTED_PREDICATE_SAMPLE_LIMIT = 20;
const IGNORE = new Set(['.git', 'target', 'node_modules', 'dist', 'build', 'out']);

export function collectRustFeatureConfigurationEvidence(rootPath) {
  const rootManifest = join(rootPath, 'Cargo.toml');
  if (!existsSync(rootManifest)) return emptyEvidence('not_present');
  const rootContract = readCargoManifest(rootPath, rootManifest);
  if (!rootContract) return emptyEvidence('unsupported');

  const unsupportedWorkspaceMemberRows = [];
  const packageCandidates = [];
  const packageCandidatePaths = new Set();
  let eligibleWorkspaceMemberCount = 0;
  if (rootContract.packageName) {
    packageCandidates.push({ path: rootManifest, contract: rootContract });
    packageCandidatePaths.add(rootManifest);
  }
  const workspaceMembers = [...new Set(rootContract.workspaceMembers)].sort();
  const consideredWorkspaceMembers = workspaceMembers.slice(0, WORKSPACE_MEMBER_LIMIT);
  for (const member of consideredWorkspaceMembers) {
    const issue = workspaceMemberIssue(rootPath, member);
    if (issue) {
      unsupportedWorkspaceMemberRows.push({ member, reason: issue });
      continue;
    }
    const memberManifest = join(rootPath, member, 'Cargo.toml');
    if (!existsSync(memberManifest)) {
      unsupportedWorkspaceMemberRows.push({ member, reason: 'manifest-not-found' });
      continue;
    }
    if (!pathResolvesInsideRoot(rootPath, memberManifest)) {
      unsupportedWorkspaceMemberRows.push({ member, reason: 'outside-root' });
      continue;
    }
    const contract = readCargoManifest(rootPath, memberManifest);
    if (!contract?.packageName) {
      unsupportedWorkspaceMemberRows.push({ member, reason: 'package-table-not-found' });
      continue;
    }
    eligibleWorkspaceMemberCount += 1;
    if (!packageCandidatePaths.has(memberManifest)) {
      packageCandidates.push({ path: memberManifest, contract });
      packageCandidatePaths.add(memberManifest);
    }
  }
  const workspaceMembersLimited = workspaceMembers.length > consideredWorkspaceMembers.length;
  const unsupportedWorkspaceMembers = unsupportedWorkspaceMemberRows.slice(
    0,
    UNSUPPORTED_WORKSPACE_MEMBER_SAMPLE_LIMIT,
  );
  const unsupportedWorkspaceMembersLimited =
    workspaceMembersLimited ||
    unsupportedWorkspaceMemberRows.length > unsupportedWorkspaceMembers.length;
  packageCandidates.sort((left, right) => left.path.localeCompare(right.path));
  if (packageCandidates.length === 0) {
    return {
      ...emptyEvidence('unsupported'),
      coverage: {
        ...emptyEvidence('unsupported').coverage,
        workspaceMode: rootContract.workspaceMembers.length > 0
          ? 'literal_direct_members'
          : 'root_package',
        workspaceMembersDeclared: rootContract.workspaceMembers.length,
        workspaceMembersConsidered: consideredWorkspaceMembers.length,
        workspaceMembersLimited,
        workspaceMembersEligible: eligibleWorkspaceMemberCount,
        workspaceMembersSkipped: workspaceMembers.length - eligibleWorkspaceMemberCount,
      },
      unsupportedWorkspaceMembers,
      unsupportedWorkspaceMembersLimited,
    };
  }

  const selectedPackages = packageCandidates.slice(0, PACKAGE_LIMIT);
  const packages = [];
  let sourceFilesDiscovered = 0;
  let sourceFilesScanned = 0;
  let sourceFilesSkipped = 0;
  let sourceFilesLimited = false;
  let remainingSourceFileBudget = SOURCE_FILE_LIMIT;
  let unsupportedPredicateCount = 0;
  const unsupportedPredicateSamples = [];
  const packageRoots = packageCandidates.map((candidate) => dirname(candidate.path));
  for (const candidate of selectedPackages) {
    const packageEvidence = buildPackageEvidence(
      rootPath,
      dirname(candidate.path),
      candidate.path,
      candidate.contract,
      packageRoots.filter((candidateRoot) => candidateRoot !== dirname(candidate.path)),
      remainingSourceFileBudget,
    );
    packages.push(packageEvidence.package);
    sourceFilesDiscovered += packageEvidence.coverage.discovered;
    sourceFilesScanned += packageEvidence.coverage.scanned;
    sourceFilesSkipped += packageEvidence.coverage.skipped;
    sourceFilesLimited ||= packageEvidence.coverage.limited;
    remainingSourceFileBudget = Math.max(
      0,
      remainingSourceFileBudget - packageEvidence.coverage.selected,
    );
    unsupportedPredicateCount += packageEvidence.unsupportedPredicates.count;
    for (const row of packageEvidence.unsupportedPredicates.samples) {
      if (unsupportedPredicateSamples.length >= UNSUPPORTED_PREDICATE_SAMPLE_LIMIT) break;
      unsupportedPredicateSamples.push(row);
    }
  }
  const packageLimited = packageCandidates.length > PACKAGE_LIMIT;
  const limited =
    packageLimited ||
    sourceFilesLimited ||
    sourceFilesSkipped > 0 ||
    unsupportedPredicateCount > 0 ||
    unsupportedWorkspaceMemberRows.length > 0 ||
    workspaceMembersLimited ||
    packages.some((pkg) => pkg.featuresLimited || pkg.features.some((feature) => feature.directMappingsLimited));
  return {
    contract: CONTRACT,
    status: limited ? 'limited' : 'observed',
    claimBoundary: {
      compileTimePredicateLocations: true,
      predicateEvaluation: false,
      runtimeImpact: false,
      importDependency: false,
      macroConsumers: false,
      semanticDependency: false,
    },
    coverage: {
      scope: 'literal_cfg_feature_attributes_in_conventional_cargo_targets',
      workspaceMode: rootContract.workspaceMembers.length > 0
        ? 'literal_direct_members'
        : 'root_package',
      workspaceMembersDeclared: rootContract.workspaceMembers.length,
      workspaceMembersConsidered: consideredWorkspaceMembers.length,
      workspaceMembersLimited,
      workspaceMembersEligible: eligibleWorkspaceMemberCount,
      workspaceMembersSkipped: workspaceMembers.length - eligibleWorkspaceMemberCount,
      packageLimit: PACKAGE_LIMIT,
      packagesDiscovered: packageCandidates.length,
      packagesScanned: selectedPackages.length,
      packagesLimited: packageLimited,
      sourceFilesDiscovered,
      sourceFilesScanned,
      sourceFilesSkipped,
      sourceFileLimit: SOURCE_FILE_LIMIT,
      sourceFilesLimited,
      predicateForms: ['cfg', 'cfg_attr'],
      predicateEvaluation: false,
      macroExpansion: false,
      buildScriptsExecuted: false,
    },
    packages,
    unsupportedWorkspaceMembers,
    unsupportedWorkspaceMembersLimited,
    unsupportedPredicates: {
      count: unsupportedPredicateCount,
      samples: unsupportedPredicateSamples,
      limited: unsupportedPredicateCount > unsupportedPredicateSamples.length,
    },
    writePolicy: {
      automaticRelation: false,
      writeAllowed: false,
      humanApprovalRequired: true,
    },
    limitations: [
      'Literal cfg feature predicates are source provenance, not proof of runtime behavior or semantic dependency.',
      'Predicate truth, target combinations, build scripts, macro expansion, use/mod imports, and downstream consumers are not evaluated.',
      'When a workspace, package, feature, mapping, or source-file limit is reached, reported discovery counts are bounded observations rather than complete repository totals.',
      'Source locations are scanned only in conventional Cargo targets (src, tests, examples, benches, and build.rs); custom target paths are outside this receipt.',
    ],
  };
}

function buildPackageEvidence(
  rootPath,
  packageRoot,
  manifestPath,
  manifest,
  excludedPackageRoots,
  sourceFileBudget,
) {
  const sourceInventory = discoverRustFiles(
    packageRoot,
    excludedPackageRoots,
    sourceFileBudget,
  );
  const selectedFeatures = manifest.features.slice(0, FEATURE_LIMIT);
  const featureNames = new Set(selectedFeatures.map((feature) => feature.name));
  const evidenceByFeature = new Map(
    selectedFeatures.map((feature) => [
      feature.name,
      {
        referenceCount: 0,
        byForm: zeroCounts(['cfg', 'cfg_attr']),
        byPolarity: zeroCounts(['positive', 'negative', 'compound', 'unknown']),
        references: [],
      },
    ]),
  );
  let unsupportedPredicateCount = 0;
  const unsupportedPredicateSamples = [];
  let scanned = 0;
  let skipped = 0;
  for (const file of sourceInventory.files) {
    let text;
    try {
      if (statSync(file).size > SOURCE_FILE_MAX_BYTES) {
        skipped += 1;
        continue;
      }
      text = readFileSync(file, 'utf-8');
      scanned += 1;
    } catch {
      skipped += 1;
      continue;
    }
    for (const attribute of extractRustFeatureAttributes(text)) {
      if (attribute.unsupportedReason) {
        unsupportedPredicateCount += 1;
        if (unsupportedPredicateSamples.length < UNSUPPORTED_PREDICATE_SAMPLE_LIMIT) {
          unsupportedPredicateSamples.push({
            path: relative(rootPath, file),
            line: attribute.line,
            form: attribute.form,
            predicate: attribute.predicate,
            reason: attribute.unsupportedReason,
          });
        }
        continue;
      }
      if (attribute.features.some((feature) => !featureNames.has(feature))) {
        unsupportedPredicateCount += 1;
        if (unsupportedPredicateSamples.length < UNSUPPORTED_PREDICATE_SAMPLE_LIMIT) {
          unsupportedPredicateSamples.push({
            path: relative(rootPath, file),
            line: attribute.line,
            form: attribute.form,
            predicate: attribute.predicate,
            reason: 'feature-not-declared-in-scanned-table',
          });
        }
      }
      for (const feature of attribute.features) {
        if (!featureNames.has(feature)) continue;
        const bucket = evidenceByFeature.get(feature);
        const reference = {
          path: relative(rootPath, file),
          line: attribute.line,
          form: attribute.form,
          meaning:
            attribute.form === 'cfg'
              ? 'conditional_inclusion'
              : 'conditional_attribute',
          polarity: attribute.polarity,
          predicate: attribute.predicate,
          sourceRole: sourceRoleOf(relative(packageRoot, file)),
        };
        bucket.referenceCount += 1;
        bucket.byForm[reference.form] += 1;
        bucket.byPolarity[reference.polarity] += 1;
        if (bucket.references.length < REFERENCES_PER_FEATURE) {
          bucket.references.push(reference);
        }
      }
    }
  }
  return {
    package: {
      manifest: relative(rootPath, manifestPath),
      packageName: manifest.packageName,
      featuresDeclared: manifest.features.length,
      featuresLimited: manifest.features.length > selectedFeatures.length,
      features: selectedFeatures.map((feature) => {
        const bucket = evidenceByFeature.get(feature.name);
        const boundedMappings = feature.values.filter(
          (value) => value.length <= DIRECT_MAPPING_MAX_LENGTH,
        );
        bucket.references.sort(
          (left, right) =>
            left.path.localeCompare(right.path) || left.line - right.line,
        );
        return {
          name: feature.name,
          directMappingsCount: feature.values.length,
          directMappings: boundedMappings.slice(0, DIRECT_MAPPING_LIMIT),
          directMappingsLimited:
            feature.values.length !== boundedMappings.length ||
            boundedMappings.length > DIRECT_MAPPING_LIMIT,
          referenceCount: bucket.referenceCount,
          byForm: bucket.byForm,
          byPolarity: bucket.byPolarity,
          references: bucket.references,
          referencesLimited: bucket.referenceCount > bucket.references.length,
        };
      }),
    },
    coverage: {
      discovered: sourceInventory.discovered,
      selected: sourceInventory.files.length,
      scanned,
      skipped,
      limited: sourceInventory.limited,
    },
    unsupportedPredicates: {
      count: unsupportedPredicateCount,
      samples: unsupportedPredicateSamples,
    },
  };
}

function emptyEvidence(status) {
  return {
    contract: CONTRACT,
    status,
    claimBoundary: {
      compileTimePredicateLocations: false,
      predicateEvaluation: false,
      runtimeImpact: false,
      importDependency: false,
      macroConsumers: false,
      semanticDependency: false,
    },
    coverage: {
      scope: 'literal_cfg_feature_attributes_in_conventional_cargo_targets',
      workspaceMode: 'root_package',
      workspaceMembersDeclared: 0,
      workspaceMembersConsidered: 0,
      workspaceMembersLimited: false,
      workspaceMembersEligible: 0,
      workspaceMembersSkipped: 0,
      packageLimit: PACKAGE_LIMIT,
      packagesDiscovered: status === 'not_present' ? 0 : 1,
      packagesScanned: 0,
      packagesLimited: false,
      sourceFilesDiscovered: 0,
      sourceFilesScanned: 0,
      sourceFilesSkipped: 0,
      sourceFileLimit: SOURCE_FILE_LIMIT,
      sourceFilesLimited: false,
      predicateForms: ['cfg', 'cfg_attr'],
      predicateEvaluation: false,
      macroExpansion: false,
      buildScriptsExecuted: false,
    },
    packages: [],
    unsupportedWorkspaceMembers: [],
    unsupportedWorkspaceMembersLimited: false,
    unsupportedPredicates: { count: 0, samples: [], limited: false },
    writePolicy: {
      automaticRelation: false,
      writeAllowed: false,
      humanApprovalRequired: true,
    },
    limitations: [
      'Rust feature configuration evidence was not available for this repository root.',
    ],
  };
}

function readCargoManifest(rootPath, manifestPath) {
  if (!pathResolvesInsideRoot(rootPath, manifestPath)) return null;
  let text;
  try {
    if (statSync(manifestPath).size > SOURCE_FILE_MAX_BYTES) return null;
    text = readFileSync(manifestPath, 'utf-8');
  } catch {
    return null;
  }
  let section = '';
  let packageName = null;
  const features = [];
  const workspaceMembers = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripTomlComment(lines[index]).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const assignment = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const key = unquote(assignment[1].trim());
    let value = assignment[2];
    if (value.trimStart().startsWith('[')) {
      while (!balancedToml(value) && index + 1 < lines.length) {
        index += 1;
        value += ` ${stripTomlComment(lines[index]).trim()}`;
      }
      if (!balancedToml(value)) return null;
    }
    if (section === 'package' && key === 'name') {
      packageName = unquote(value.trim());
    } else if (section === 'features') {
      features.push({
        name: key,
        values: [...value.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]),
      });
    } else if (section === 'workspace' && key === 'members') {
      workspaceMembers.push(
        ...[...value.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]),
      );
    }
  }
  features.sort((left, right) => left.name.localeCompare(right.name));
  return { packageName, features, workspaceMembers };
}

function workspaceMemberIssue(rootPath, member) {
  if (
    typeof member !== 'string' ||
    member.length === 0 ||
    member.trim() !== member ||
    isAbsolute(member) ||
    member.includes('\\')
  ) return 'invalid-member-path';
  if (/[*?\[\]{}]/.test(member)) return 'glob-not-supported';
  const memberPath = join(rootPath, member);
  const lexical = relative(rootPath, memberPath);
  if (lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) {
    return 'outside-root';
  }
  return null;
}

function discoverRustFiles(rootPath, excludedPackageRoots = [], limit = SOURCE_FILE_LIMIT) {
  const files = [];
  let discovered = 0;
  let limited = limit === 0;
  const excluded = new Set(excludedPackageRoots);
  const walk = (directory) => {
    if (limited) return false;
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch {
      return true;
    }
    for (const name of entries) {
      if (IGNORE.has(name) || name.startsWith('.')) continue;
      const path = join(directory, name);
      if (excluded.has(path)) continue;
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (!walk(path)) return false;
        continue;
      }
      if (!stat.isFile() || !name.endsWith('.rs')) continue;
      discovered += 1;
      if (files.length < limit) files.push(path);
      else {
        limited = true;
        return false;
      }
    }
    return true;
  };
  const targetRoots = [
    join(rootPath, 'build.rs'),
    ...['src', 'tests', 'examples', 'benches'].map((name) => join(rootPath, name)),
  ].sort();
  for (const targetRoot of targetRoots) {
    if (limited) break;
    let stat;
    try {
      stat = lstatSync(targetRoot);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      walk(targetRoot);
      continue;
    }
    if (!stat.isFile() || !targetRoot.endsWith('.rs')) continue;
    discovered += 1;
    if (files.length < limit) files.push(targetRoot);
    else limited = true;
  }
  return { files, discovered, limited };
}

function extractRustFeatureAttributes(text) {
  const rows = [];
  let index = 0;
  let line = 1;
  while (index < text.length) {
    if (text.startsWith('//', index)) {
      const end = text.indexOf('\n', index + 2);
      if (end === -1) break;
      index = end;
      continue;
    }
    if (text.startsWith('/*', index)) {
      const consumed = consumeBlockComment(text, index);
      line += countNewlines(text.slice(index, consumed));
      index = consumed;
      continue;
    }
    const rawEnd = consumeRawString(text, index);
    if (rawEnd !== null) {
      line += countNewlines(text.slice(index, rawEnd));
      index = rawEnd;
      continue;
    }
    if (text[index] === '"') {
      const consumed = consumeQuoted(text, index, '"');
      line += countNewlines(text.slice(index, consumed));
      index = consumed;
      continue;
    }
    if (text.startsWith('#[', index) || text.startsWith('#![', index)) {
      const captured = captureAttribute(text, index);
      if (captured) {
        const parsed = parseFeatureAttribute(captured.text, line);
        if (parsed) rows.push(parsed);
        line += countNewlines(captured.text);
        index = captured.end;
        continue;
      }
    }
    if (text[index] === '\n') line += 1;
    index += 1;
  }
  return rows;
}

function captureAttribute(text, start) {
  let depth = 0;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text.startsWith('//', index)) {
      const end = text.indexOf('\n', index + 2);
      if (end === -1) return null;
      index = end;
      continue;
    }
    if (text.startsWith('/*', index)) {
      index = consumeBlockComment(text, index) - 1;
      continue;
    }
    const rawEnd = consumeRawString(text, index);
    if (rawEnd !== null) {
      index = rawEnd - 1;
      continue;
    }
    if (text[index] === '"') {
      index = consumeQuoted(text, index, '"') - 1;
      continue;
    }
    if (text[index] === '[') depth += 1;
    if (text[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        return { text: text.slice(start, index + 1), end: index + 1 };
      }
    }
  }
  return null;
}

function parseFeatureAttribute(attribute, line) {
  const match = attribute.match(/^#!?\[\s*(cfg|cfg_attr)\s*\(/s);
  if (!match) return null;
  const form = match[1];
  const open = attribute.indexOf('(', match.index ?? 0);
  const close = findMatchingParen(attribute, open);
  if (close === -1) return null;
  const body = attribute.slice(open + 1, close);
  const predicate = form === 'cfg_attr' ? splitTopLevel(body)[0] ?? '' : body;
  const normalized = predicate.replace(/\s+/g, ' ').trim();
  const features = [...normalized.matchAll(/\bfeature\s*=\s*"([^"\\\r\n]+)"/g)]
    .map((featureMatch) => featureMatch[1]);
  if (features.length === 0) {
    return /\bfeature\s*=/.test(normalized)
      ? {
          line,
          form,
          predicate: normalized,
          polarity: 'unknown',
          features: [],
          unsupportedReason: 'non-literal-feature-name',
        }
      : null;
  }
  const exactPositive = normalized.match(/^feature\s*=\s*"([^"\\\r\n]+)"$/);
  const exactNegative = normalized.match(
    /^not\s*\(\s*feature\s*=\s*"([^"\\\r\n]+)"\s*\)$/,
  );
  return {
    line,
    form,
    predicate: normalized,
    polarity: exactPositive ? 'positive' : exactNegative ? 'negative' : 'compound',
    features: [...new Set(features)],
    unsupportedReason: null,
  };
}

function findMatchingParen(value, open) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')' && --depth === 0) return index;
  }
  return -1;
}

function splitTopLevel(value) {
  const rows = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (quote) continue;
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      rows.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  rows.push(value.slice(start).trim());
  return rows;
}

function consumeBlockComment(text, start) {
  let depth = 1;
  let index = start + 2;
  while (index < text.length && depth > 0) {
    if (text.startsWith('/*', index)) {
      depth += 1;
      index += 2;
    } else if (text.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  return index;
}

function consumeRawString(text, start) {
  const match = text.slice(start).match(/^(?:br|r)(#*)"/);
  if (!match) return null;
  const terminator = `"${match[1]}`;
  const end = text.indexOf(terminator, start + match[0].length);
  return end === -1 ? text.length : end + terminator.length;
}

function consumeQuoted(text, start, quote) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (text[index] === '\\') {
      escaped = true;
      continue;
    }
    if (text[index] === quote) return index + 1;
  }
  return text.length;
}

function sourceRoleOf(filePath) {
  const segments = filePath.replaceAll('\\', '/').toLowerCase().split('/');
  if (segments.some((segment) => ['test', 'tests'].includes(segment))) return 'test';
  const fileName = segments.at(-1) ?? '';
  const stem = fileName.replace(/\.rs$/i, '');
  if (/\.(?:test|spec)$/.test(stem) || /^test_.+/.test(stem) || /.+_test$/.test(stem)) {
    return 'test';
  }
  return 'production';
}

function zeroCounts(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

function countNewlines(value) {
  return (value.match(/\n/g) ?? []).length;
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

function balancedToml(value) {
  let depth = 0;
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
    if (character === '[') depth += 1;
    if (character === ']') depth -= 1;
  }
  return quote === null && depth === 0;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) return value.slice(1, -1);
  return value;
}

function pathResolvesInsideRoot(rootPath, path) {
  try {
    const resolvedFromRoot = relative(realpathSync(rootPath), realpathSync(path));
    return !(
      resolvedFromRoot === '..' ||
      resolvedFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(resolvedFromRoot)
    );
  } catch {
    return false;
  }
}
