const PROFILE_CONTRACT = 'architecture-profile/v1';
const BRIEF_CONTRACT = 'architectureBrief:v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLE_ID = /^[a-z][a-z0-9-]*$/;
const MATCHED_FILE_SAMPLE_LIMIT = 20;
const VIOLATION_SAMPLE_LIMIT = 50;

function nonBlank(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function stringArray(value, name, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings.`);
  }
  const rows = value.map((item, index) => nonBlank(item, `${name}[${index}]`));
  if (new Set(rows).size !== rows.length) throw new Error(`${name} must not contain duplicates.`);
  return rows;
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export function matchesPathPattern(path, pattern) {
  const candidate = normalizePath(path);
  const normalized = normalizePath(pattern);
  if (!normalized) return false;
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`).test(candidate);
}

function parsePatterns(value) {
  return stringArray(value, 'patterns').map((row, index) => {
    const separator = row.indexOf(':');
    if (separator <= 0 || separator === row.length - 1) {
      throw new Error(`patterns[${index}] must use axis:name.`);
    }
    return {
      axis: nonBlank(row.slice(0, separator), `patterns[${index}].axis`),
      name: nonBlank(row.slice(separator + 1), `patterns[${index}].name`),
    };
  });
}

export function parseArchitectureProfile(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('architecture profile frontmatter must be an object.');
  }
  if (frontmatter.architecture_schema !== PROFILE_CONTRACT) {
    throw new Error(`architecture_schema must be ${PROFILE_CONTRACT}.`);
  }
  const uid = nonBlank(frontmatter.profile_uid, 'profile_uid');
  const projectUid = nonBlank(frontmatter.project_uid, 'project_uid');
  if (!UUID_V4.test(uid)) throw new Error('profile_uid must be a lowercase UUIDv4.');
  if (!UUID_V4.test(projectUid)) throw new Error('project_uid must be a lowercase UUIDv4.');

  const roleEntries = Object.entries(frontmatter)
    .filter(([key]) => key.startsWith('role_') && key !== 'role_order')
    .map(([key, value]) => {
      const id = key.slice('role_'.length);
      if (!ROLE_ID.test(id)) throw new Error(`Invalid architecture role id: ${id}.`);
      return [id, stringArray(value, key)];
    });
  if (roleEntries.length < 2) throw new Error('architecture profile needs at least two roles.');
  const rolePaths = new Map(roleEntries);
  const roleOrder = frontmatter.role_order === undefined
    ? [...rolePaths.keys()].sort()
    : stringArray(frontmatter.role_order, 'role_order');
  if (roleOrder.length !== rolePaths.size || roleOrder.some((id) => !rolePaths.has(id))) {
    throw new Error('role_order must name every role exactly once.');
  }

  const dependencyPolicy = frontmatter.dependency_policy === undefined
    ? 'explicit'
    : nonBlank(frontmatter.dependency_policy, 'dependency_policy');
  if (!['explicit', 'lower-only'].includes(dependencyPolicy)) {
    throw new Error('dependency_policy must be explicit or lower-only.');
  }
  const typeOnlyDependencies = frontmatter.type_only_dependencies === undefined
    ? 'free'
    : frontmatter.type_only_dependencies;
  if (!['ruled', 'free'].includes(typeOnlyDependencies)) {
    throw new Error('type_only_dependencies must be ruled or free.');
  }
  const allows = new Map();
  for (const roleId of roleOrder) {
    const key = `allow_${roleId}`;
    if (!Object.hasOwn(frontmatter, key)) continue;
    const targets = stringArray(frontmatter[key], key, { allowEmpty: true });
    const unknown = targets.find((target) => !rolePaths.has(target));
    if (unknown) throw new Error(`${key} references unknown role: ${unknown}.`);
    allows.set(roleId, targets);
  }

  return {
    contract: PROFILE_CONTRACT,
    uid,
    slug: nonBlank(frontmatter.profile_slug, 'profile_slug'),
    projectUid,
    title: nonBlank(frontmatter.title, 'title'),
    patterns: parsePatterns(frontmatter.patterns),
    scopePaths: stringArray(frontmatter.scope_paths, 'scope_paths'),
    excludePaths: frontmatter.exclude_paths === undefined
      ? []
      : stringArray(frontmatter.exclude_paths, 'exclude_paths'),
    roles: roleOrder.map((id) => ({ id, paths: rolePaths.get(id) })),
    dependencyPolicy,
    typeOnlyDependencies,
    allows,
    evidence: stringArray(frontmatter.evidence, 'evidence'),
  };
}

/**
 * ⚠️ **A collision has to say which two files collided.**
 *
 * Measured 2026-08-26: `atlas architecture .` at this repository's root died with
 * `Duplicate architecture profile slug: atlas-web.` and nothing else. The cause was the
 * repository's own generated mirror — `pnpm docs-vault:build` copies the vault into
 * `public/docs-vault/`, so the one profile was found twice. The message named neither path, so
 * the only way to learn that was to grep for the slug.
 *
 * Two collisions are not the same thing, and conflating them is what made the message useless:
 *
 * - **The same profile seen twice.** Identical `profile_uid` and identical frontmatter is one
 *   record reached by two paths — a generated mirror, a symlinked vault, a scan whose root
 *   contains both. Refusing to run is wrong; there is nothing for a person to resolve.
 * - **Two different profiles wearing one name.** Different `profile_uid`, or the same uid with
 *   frontmatter that disagrees, is a genuine conflict and must still fail closed — but now the
 *   error names both documents, because "which two?" is the whole question.
 */
function profileFingerprint(frontmatter) {
  // Key order must not decide identity: two mirrors of one file can serialise differently.
  return JSON.stringify(
    Object.fromEntries(Object.entries(frontmatter).sort(([left], [right]) => (left < right ? -1 : 1))),
  );
}

export function findArchitectureProfiles(docs) {
  const profiles = [];
  const seen = new Map();
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (doc?.frontmatter?.architecture_schema !== PROFILE_CONTRACT) continue;
    const profile = parseArchitectureProfile(doc.frontmatter);
    const documentSlug = doc.slug ?? null;
    const fingerprint = profileFingerprint(doc.frontmatter);
    const previous = seen.get(profile.slug);
    if (previous) {
      if (previous.uid === profile.uid && previous.fingerprint === fingerprint) {
        // One record reached twice. Keep the first path and carry on.
        continue;
      }
      throw new Error(
        `Duplicate architecture profile slug: ${profile.slug}. ` +
          `${previous.documentSlug ?? '(unnamed document)'} and ${documentSlug ?? '(unnamed document)'} ` +
          'both declare it with different contents. Give one of them another profile_slug, ' +
          'or narrow the scan so only one is read.',
      );
    }
    seen.set(profile.slug, { uid: profile.uid, fingerprint, documentSlug });
    profiles.push({ ...profile, documentSlug });
  }
  return profiles.sort((left, right) => left.slug.localeCompare(right.slug, 'en'));
}

function matchingRoles(profile, path) {
  return profile.roles
    .filter((role) => role.paths.some((pattern) => matchesPathPattern(path, pattern)))
    .map((role) => role.id);
}

function inScope(profile, path) {
  return profile.scopePaths.some((pattern) => matchesPathPattern(path, pattern))
    && !profile.excludePaths.some((pattern) => matchesPathPattern(path, pattern));
}

function excludedFromScope(profile, path) {
  return profile.excludePaths.some((pattern) => matchesPathPattern(path, pattern));
}

function ruleFor(profile, fromRole, toRole) {
  if (fromRole === toRole) return { allowed: true, rule: 'same-role' };
  if (profile.dependencyPolicy === 'lower-only') {
    const fromIndex = profile.roles.findIndex((role) => role.id === fromRole);
    const toIndex = profile.roles.findIndex((role) => role.id === toRole);
    return { allowed: fromIndex < toIndex, rule: 'lower-only' };
  }
  if (!profile.allows.has(fromRole)) return { allowed: null, rule: `allow-${fromRole}` };
  return {
    allowed: profile.allows.get(fromRole).includes(toRole),
    rule: `allow-${fromRole}`,
  };
}

export function evaluateArchitectureConformance(profile, importResult) {
  const edges = Array.isArray(importResult?.edges) ? importResult.edges : [];
  const filesByRole = new Map(profile.roles.map((role) => [role.id, new Set()]));
  const observed = new Map();
  const violations = [];
  let unmappedEdges = 0;
  let unruledEdges = 0;
  let typeOnlyEdgeCount = 0;
  // Whole-scan usage discrimination receipt. `missing` counts edges the scanner
  // emitted without any importUsage field; the record writer's mechanical gate
  // reads these counts to refuse minting a receipt from a scan that cannot
  // tell a type-only import from a value import.
  const importUsageCounts = { value: 0, type_only: 0, unknown: 0, missing: 0 };
  for (const edge of edges) {
    if (edge.importUsage === undefined) importUsageCounts.missing += 1;
    else if (Object.hasOwn(importUsageCounts, edge.importUsage)) {
      importUsageCounts[edge.importUsage] += 1;
    } else importUsageCounts.unknown += 1;
  }

  for (const edge of edges) {
    // Architecture rules govern dependencies *originating* in the selected
    // scope. Excluded sources (tests, fixtures, generated code) do not become
    // violations merely because their target is production code. A production
    // source pointing outside the model remains an explicit unknown below.
    if (!inScope(profile, edge.from)) continue;
    if (excludedFromScope(profile, edge.to)) continue;
    const fromRoles = matchingRoles(profile, edge.from);
    const toRoles = matchingRoles(profile, edge.to);
    if (fromRoles.length !== 1 || toRoles.length !== 1) {
      unmappedEdges += 1;
      continue;
    }
    // Type-only edges have a profile-declared ruling (2026-08-27 decision):
    // under 'free' (the default) a cited compile-time-only import is neither a
    // violation nor an allowed edge -- it leaves the violated/allowed
    // accounting entirely and is reported as its own named class. Under
    // 'ruled' it is evaluated exactly like a value edge. Edges without usage
    // information ('unknown' or absent) keep the existing fail-closed path.
    if (edge.importUsage === 'type_only') {
      typeOnlyEdgeCount += 1;
      if (profile.typeOnlyDependencies !== 'ruled') continue;
    }
    const [fromRole] = fromRoles;
    const [toRole] = toRoles;
    filesByRole.get(fromRole).add(normalizePath(edge.from));
    filesByRole.get(toRole).add(normalizePath(edge.to));
    const key = `${fromRole}\u0000${toRole}`;
    const row = observed.get(key) ?? {
      fromRole,
      toRole,
      count: 0,
      evidence: [],
    };
    row.count += 1;
    if (row.evidence.length < 3) {
      row.evidence.push({ from: normalizePath(edge.from), to: normalizePath(edge.to), kind: edge.kind ?? 'unknown' });
    }
    observed.set(key, row);

    const decision = ruleFor(profile, fromRole, toRole);
    if (decision.allowed === null) {
      unruledEdges += 1;
    } else if (!decision.allowed) {
      violations.push({
        fromRole,
        toRole,
        from: normalizePath(edge.from),
        to: normalizePath(edge.to),
        kind: edge.kind ?? 'unknown',
        importUsage: edge.importUsage ?? 'unknown',
        rule: decision.rule,
      });
    }
  }

  const roles = profile.roles.map((role) => {
    const matched = [...filesByRole.get(role.id)].sort();
    return {
      id: role.id,
      paths: role.paths,
      matchedFileCount: matched.length,
      matchedFiles: matched.slice(0, MATCHED_FILE_SAMPLE_LIMIT),
      matchedFilesLimited: matched.length > MATCHED_FILE_SAMPLE_LIMIT,
    };
  });
  const emptyRoles = roles.filter((role) => role.matchedFiles.length === 0).map((role) => role.id);
  const coverageIncomplete = importResult?.coverage?.allDetectedLanguagesSupported !== true;
  const hasUnknown = coverageIncomplete || unmappedEdges > 0 || unruledEdges > 0 || emptyRoles.length > 0;
  const status = violations.length > 0 ? 'violated' : hasUnknown ? 'unknown' : 'conforms';

  return {
    contract: 'architectureConformance:v1',
    status,
    roles,
    observedRoleEdges: [...observed.values()].sort((a, b) =>
      `${a.fromRole}:${a.toRole}`.localeCompare(`${b.fromRole}:${b.toRole}`, 'en'),
    ),
    violationCount: violations.length,
    violations: violations.slice(0, VIOLATION_SAMPLE_LIMIT),
    violationsLimited: violations.length > VIOLATION_SAMPLE_LIMIT,
    typeOnlyEdgeCount,
    unknown: {
      coverageIncomplete,
      unmappedEdges,
      unruledEdges,
      emptyRoles,
    },
    source: {
      rootPath: importResult?.rootPath ?? null,
      filesScanned: Number(importResult?.filesScanned ?? 0),
      supportedLanguages: Array.isArray(importResult?.coverage?.supportedLanguages)
        ? importResult.coverage.supportedLanguages
        : [],
      importUsageCounts,
    },
  };
}

const GIT_REVISION_RE = /^[0-9a-f]{40}$/;
const FOLDER_FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;
const MEASURED_GIT_SHORT_SHA_LENGTH = 12;

/**
 * Dated measurement stamp for an architectureBrief:v1 (2026-08-27 decision,
 * point 2). The stamp says when the scan ran, which tool produced it, and the
 * exact source state it saw: a real commit short-sha plus dirty flag for git
 * sources, a `sha256:` inventory fingerprint for plain folders. The two are
 * never conflated: a git stamp carries no fingerprint and a folder stamp
 * carries no sha.
 */
export function buildArchitectureMeasuredStamp(inspection, { at, toolName, toolVersion } = {}) {
  const measuredAt = at ?? new Date().toISOString();
  if (typeof measuredAt !== 'string' || Number.isNaN(Date.parse(measuredAt))) {
    throw new Error('measured stamp requires an ISO-8601 time.');
  }
  const tool = {
    name: nonBlank(toolName, 'measured stamp tool name'),
    version: nonBlank(toolVersion, 'measured stamp tool version'),
  };
  if (inspection?.kind === 'git') {
    if (typeof inspection.revision !== 'string' || !GIT_REVISION_RE.test(inspection.revision)) {
      throw new Error('measured stamp requires a full git commit sha from the source inspection.');
    }
    if (typeof inspection.dirty !== 'boolean') {
      throw new Error('measured stamp requires a boolean git dirty flag.');
    }
    return {
      at: measuredAt,
      tool,
      source: {
        kind: 'git',
        revision: inspection.revision.slice(0, MEASURED_GIT_SHORT_SHA_LENGTH),
        dirty: inspection.dirty,
      },
    };
  }
  if (inspection?.kind === 'folder') {
    if (typeof inspection.fingerprint !== 'string' || !FOLDER_FINGERPRINT_RE.test(inspection.fingerprint)) {
      throw new Error('measured stamp requires a sha256: folder fingerprint from the source inspection.');
    }
    return {
      at: measuredAt,
      tool,
      source: { kind: 'folder', fingerprint: inspection.fingerprint },
    };
  }
  throw new Error('measured stamp requires a git or folder source inspection.');
}

export function buildArchitectureBrief(profile, importResult, { measured } = {}) {
  const conformance = evaluateArchitectureConformance(profile, importResult);
  const nextActions = [];
  if (conformance.violations.length > 0) {
    nextActions.push({ id: 'inspect_violations', count: conformance.violations.length });
  }
  if (conformance.status === 'unknown') {
    nextActions.push({ id: 'close_measurement_gaps', unknown: conformance.unknown });
  }
  nextActions.push({ id: 'plan_within_architecture', profileSlug: profile.slug });
  return {
    contract: BRIEF_CONTRACT,
    sideEffect: 0,
    profile: {
      uid: profile.uid,
      slug: profile.slug,
      projectUid: profile.projectUid,
      title: profile.title,
      patterns: profile.patterns,
      scopePaths: profile.scopePaths,
      excludePaths: profile.excludePaths,
      roles: profile.roles.map((role) => ({
        id: role.id,
        paths: role.paths,
        allowedDependencies: profile.dependencyPolicy === 'lower-only'
          ? profile.roles
              .slice(profile.roles.findIndex((row) => row.id === role.id) + 1)
              .map((row) => row.id)
          : profile.allows.get(role.id) ?? null,
      })),
      dependencyPolicy: profile.dependencyPolicy,
      typeOnlyDependencies: profile.typeOnlyDependencies,
      evidence: profile.evidence,
    },
    ...(measured !== undefined ? { measured } : {}),
    conformance,
    agentPlanContract: {
      contract: 'architectureChangePlan:v1',
      requiredFields: [
        'touchedRoles',
        'plannedPaths',
        'expectedNewDependencies',
        'crossedBoundaries',
        'preservedInterfaces',
        'verificationCommands',
        'unknowns',
      ],
    },
    nextActions,
  };
}
