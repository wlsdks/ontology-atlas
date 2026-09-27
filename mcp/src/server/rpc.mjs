/**
 * The JSON-RPC result and error envelope: how a handler's return value becomes
 * `content` + `structuredContent`, and how a thrown error becomes a typed code,
 * a readable message, and the nearest-value hints an agent recovers from.
 */

import { closestAllowedValue } from '../suggestions.mjs';
import { VaultConflictError } from '../vault.mjs';
import { TOOL_BY_NAME } from './registry.mjs';

function formatUnknownToolError(name) {
  const allowedNames = [...TOOL_BY_NAME.keys()].sort();
  const suggestion = closestAllowedValue(name, allowedNames);
  const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
  return `Unknown tool: ${name}.${suggestionText} Allowed tools: ${allowedNames.join(', ')}.`;
}

const OK_ENVELOPE_BYTES = Buffer.byteLength('{"content":[{"type":"text","text":""}],"structuredContent":}');

/**
 * The UTF-8 bytes `ok(result)` puts on the wire: the pretty text once, escaped as
 * a JSON string, and the result once, compact. Both follow from the pretty text,
 * so `result` is serialized once: inside it every raw `"`, `\` and line break
 * gains a backslash when embedded, and every space or line break outside a string
 * is layout the compact form drops.
 *
 * @param {object} result
 * @param {string} [text] `JSON.stringify(result, null, 2)`, when the caller has it
 * @returns {number}
 */
function okResponseBytes(result, text = JSON.stringify(result, null, 2)) {
  const textBytes = Buffer.byteLength(text, 'utf8');
  let escapes = 0;
  let layout = 0;
  let inString = false;
  let escaping = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x22 || code === 0x5c || code === 0x0a) escapes += 1;
    if (inString) {
      if (escaping) escaping = false;
      else if (code === 0x5c) escaping = true;
      else if (code === 0x22) inString = false;
    } else if (code === 0x22) {
      inString = true;
    } else if (code === 0x20 || code === 0x0a) {
      layout += 1;
    }
  }
  return OK_ENVELOPE_BYTES + textBytes + escapes + textBytes - layout;
}

/**
 * Bytes of response text one call may return, the automatic limit `infer_imports`
 * already keeps. The wire carries the text twice (as text and as
 * `structuredContent`), so a response stays near 256 KiB.
 */
const RESPONSE_TEXT_BUDGET_BYTES = 128 * 1024;
/** Room kept for the `truncation` note and the corrected pages. */
const TRUNCATION_NOTE_BYTES = 2048;
const TRUNCATION_MAX_DEPTH = 6;
const TRUNCATION_MAX_PASSES = 4;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const prettyBytes = (value) => Buffer.byteLength(JSON.stringify(value, null, 2) ?? '', 'utf8');

/**
 * Every tool result goes out as pretty JSON text and as the same object in
 * `structuredContent`. The MCP specification asks a tool with structured output to
 * send the text too, and a client that declared the tool's `outputSchema` (the
 * SDK client Claude Code uses) rejects a success without `structuredContent`, so
 * both stay.
 *
 * A result whose text is over the budget keeps only the first rows of its longest
 * lists (`fitToResponseBudget`). `bounded: false` delivers it as it is, for a call
 * whose caller chose the size (`callerChoseSize`).
 *
 * @param {unknown} result
 * @param {{ tool?: string|null, bounded?: boolean }} [options]
 */
function ok(result, { tool = null, bounded = true } = {}) {
  const compactPrompt = result?.contract === 'agentBriefCompact:v2'
    && typeof result?.handoffPrompt === 'string'
    ? result.handoffPrompt
    : null;
  let delivered = result;
  let text = compactPrompt ?? JSON.stringify(result, null, 2);
  if (bounded && compactPrompt === null && isRecord(result)) {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > RESPONSE_TEXT_BUDGET_BYTES) {
      delivered = fitToResponseBudget(result, { bytes, budgetBytes: RESPONSE_TEXT_BUDGET_BYTES, tool });
      if (delivered !== result) text = JSON.stringify(delivered, null, 2);
    }
  }
  const response = { content: [{ type: 'text', text }] };
  if (isRecord(delivered)) response.structuredContent = delivered;
  return response;
}

/** Arrays reachable through plain objects, largest first; array elements are not entered. */
function arraysByTextSize(result) {
  const found = [];
  const visit = (value, path) => {
    if (path.length > TRUNCATION_MAX_DEPTH) return;
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child)) {
        if (child.length > 1) found.push({ path: [...path, key], array: child, bytes: prettyBytes(child) });
      } else if (isRecord(child)) {
        visit(child, [...path, key]);
      }
    }
  };
  visit(result, []);
  return found.sort((left, right) => right.bytes - left.bytes);
}

/** How many leading elements to keep so about `excess` bytes go; at least one stays. */
function leadingElementsToKeep(array, excess, depth) {
  // Each element sits on its own lines, indented once more than its array.
  const lineOverhead = 2 * (depth + 1) + 2;
  let kept = array.length;
  let removed = 0;
  while (kept > 1 && removed < excess) {
    kept -= 1;
    removed += prettyBytes(array[kept]) + lineOverhead;
  }
  return { kept, removed };
}

function withValueAt(root, path, value) {
  const copy = { ...root };
  let cursor = copy;
  for (const key of path.slice(0, -1)) {
    cursor[key] = { ...cursor[key] };
    cursor = cursor[key];
  }
  cursor[path.at(-1)] = value;
  return copy;
}

/**
 * The page a result reports for a cut array, corrected so `nextOffset` resumes
 * right after the rows that stayed: `<key>Pagination` beside it, or a
 * `pagination` whose `returned` counted exactly this array (`list_concepts`). A
 * `nextCall` beside it that resumed at the old offset moves with it, and a
 * `<key>Hint` that described the old page is dropped.
 */
function withCorrectedPage(root, path, originalLength, kept) {
  const parentPath = path.slice(0, -1);
  const key = path.at(-1);
  const parent = parentPath.reduce((value, step) => value?.[step], root);
  for (const pageKey of [`${key}Pagination`, 'pagination']) {
    const page = parent?.[pageKey];
    if (!isRecord(page) || page.returned !== originalLength || !Number.isInteger(page.offset)) continue;
    const nextOffset = page.offset + kept;
    let next = withValueAt(root, [...parentPath, pageKey], { ...page, returned: kept, hasMore: true, nextOffset });
    if (parent.returned === originalLength) next = withValueAt(next, [...parentPath, 'returned'], kept);
    if (typeof parent.limited === 'boolean') next = withValueAt(next, [...parentPath, 'limited'], true);
    const call = parent.nextCall;
    if (isRecord(call?.arguments) && call.arguments.offset === page.nextOffset) {
      next = withValueAt(next, [...parentPath, 'nextCall'], { ...call, arguments: { ...call.arguments, offset: nextOffset } });
    }
    if (typeof parent[`${key}Hint`] === 'string') {
      const holder = parentPath.reduce((value, step) => value[step], next);
      delete holder[`${key}Hint`];
    }
    return next;
  }
  return root;
}

const PAGING_ARGUMENT = /(?:limit|offset|cursor)$/i;
/** Arguments that choose an answer's shape or size without paging it. */
const SHAPE_ARGUMENTS = new Set(['full', 'detail', 'body', 'summary', 'includeIndexes', 'allowLargeResponse', 'reviewMode']);

/** The arguments of `tool` that page or bound its answer, for the truncation hint. */
function pagingArgumentsOf(tool) {
  const properties = TOOL_BY_NAME.get(tool)?.inputSchema?.properties ?? {};
  return Object.keys(properties).filter((name) => PAGING_ARGUMENT.test(name));
}

/**
 * Whether the caller chose the answer's size: a page argument (`limit`, `offset`,
 * `cursor` and their prefixed forms) or a shape argument (`full`, `detail`,
 * `body`, `summary`, ...). Such an answer is delivered as asked, the way
 * `infer_imports` honours an explicit request for its full scan: `project_scope`
 * with `limit: 500` has no offset, so a cut would leave rows no call can reach.
 */
function callerChoseSize(args) {
  return Object.entries(args ?? {}).some(([name, value]) => (
    value !== undefined && (PAGING_ARGUMENT.test(name) || SHAPE_ARGUMENTS.has(name))
  ));
}

/**
 * Cuts the longest lists of an over-budget result to their first rows until its
 * text fits, and says so: `truncated: true` and `truncation` (budget, full size,
 * each cut list's path with the rows kept of the total, and how to page or
 * narrow). A page the result reports for a cut list is corrected, so an agent
 * that follows `nextOffset` loses no row. A result with no list to cut is
 * returned unchanged.
 */
function fitToResponseBudget(result, { bytes, budgetBytes, tool }) {
  let fitted = result;
  let current = bytes;
  const cuts = new Map();
  for (let pass = 0; pass < TRUNCATION_MAX_PASSES && current > budgetBytes; pass += 1) {
    let excess = current - budgetBytes + TRUNCATION_NOTE_BYTES;
    for (const { path, array } of arraysByTextSize(fitted)) {
      if (excess <= 0) break;
      const { kept, removed } = leadingElementsToKeep(array, excess, path.length);
      if (kept === array.length) continue;
      const name = path.join('.');
      cuts.set(name, { path: name, kept, total: cuts.get(name)?.total ?? array.length });
      fitted = withCorrectedPage(withValueAt(fitted, path, array.slice(0, kept)), path, array.length, kept);
      excess -= removed;
    }
    current = prettyBytes(fitted);
  }
  if (cuts.size === 0) return result;
  const paging = pagingArgumentsOf(tool);
  return {
    ...fitted,
    truncated: true,
    truncation: {
      budgetBytes,
      fullBytes: bytes,
      cut: [...cuts.values()],
      hint:
        `The answer was ${bytes} bytes of text, over the ${budgetBytes}-byte budget, so each list under cut keeps only its first rows. `
        + `Resume from the nextOffset a page reports${paging.length > 0 ? `, or narrow the call with ${paging.join(', ')}` : ', or narrow the call'}.`,
    },
  };
}

function error(err) {
  const message = err instanceof Error ? err.message : String(err);
  const details = structuredErrorDetails(message);
  // Slug-unresolved paths (`get_concept`, `node_profile`) attach a growthHint to
  // the Error instance; this is the one place that collects them and lifts them
  // into `structuredContent`. Never present on a success response.
  const growthHint = err && typeof err === 'object' ? err.growthHint : undefined;
  const repairFields = err && typeof err === 'object' && err.repairFields
    ? err.repairFields
    : {};
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    structuredContent: {
      ok: false,
      errorCode: classifyErrorCode(err, message),
      error: message,
      ...details,
      ...repairFields,
      ...(growthHint ? { growthHint } : {}),
    },
  };
}

function structuredErrorDetails(message) {
  const unknownTool = message.match(/^Unknown tool: ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed tools: (.+)\.$/i);
  if (unknownTool) {
    const [, receivedTool, suggestion, allowedText] = unknownTool;
    return omitUndefined({
      receivedTool,
      suggestion,
      allowedTools: splitCommaList(allowedText),
    });
  }

  const unknownArgument = message.match(
    /^Unknown argument "([^"]+)" for ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed arguments: (.+)\. Received arguments: (.+)\.$/i,
  );
  if (unknownArgument) {
    const [, receivedArgument, toolName, suggestion, allowedText, receivedText] = unknownArgument;
    return omitUndefined({
      toolName,
      receivedArgument,
      suggestion,
      unknownArguments: [omitUndefined({ name: receivedArgument, suggestion })],
      allowedArguments: splitCommaList(allowedText),
      receivedArguments: splitCommaList(receivedText),
    });
  }

  const unknownArguments = message.match(
    /^Unknown arguments for ([^:]+): (.+)\. Allowed arguments: (.+)\. Received arguments: (.+)\.$/i,
  );
  if (unknownArguments) {
    const [, toolName, unknownText, allowedText, receivedText] = unknownArguments;
    return {
      toolName,
      receivedArguments: splitCommaList(receivedText),
      unknownArguments: extractUnknownArgumentHints(unknownText),
      allowedArguments: splitCommaList(allowedText),
    };
  }

  const unknownField = message.match(
    /^Unknown field "([^"]+)" in ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed fields: (.+)\. Received fields: (.+)\.$/i,
  );
  if (unknownField) {
    const [, receivedField, rowName, suggestion, allowedText, receivedText] = unknownField;
    return omitUndefined({
      rowName,
      receivedField,
      suggestion,
      unknownFields: [omitUndefined({ name: receivedField, suggestion })],
      allowedFields: splitCommaList(allowedText),
      receivedFields: splitCommaList(receivedText),
    });
  }

  const unknownFields = message.match(
    /^Unknown fields in ([^:]+): (.+)\. Allowed fields: (.+)\. Received fields: (.+)\.$/i,
  );
  if (unknownFields) {
    const [, rowName, unknownText, allowedText, receivedText] = unknownFields;
    return {
      rowName,
      unknownFields: extractUnknownArgumentHints(unknownText),
      allowedFields: splitCommaList(allowedText),
      receivedFields: splitCommaList(receivedText),
    };
  }

  const allowedValue = message.match(/^(.+?) must be one of: (.+)\. Received: (.+)\.(?: Did you mean "([^"]+)"\?)?$/i);
  if (allowedValue) {
    const [, valueName, allowedText, receivedText, suggestion] = allowedValue;
    return omitUndefined({
      valueName,
      receivedValue: parseReceivedValueText(receivedText),
      suggestion,
      allowedValues: splitCommaList(allowedText),
    });
  }

  const missingSlug = message.match(
    /^(.+?): "([^"]+)"\. Use list_concepts\(\) to see all slugs, or find_evidence\(\{title:"[^"]*"\}\) to search by title\.(?: If the endpoint is real but absent, create it first with add_concept\(slug, kind, title\)\.)?(?: Similar slugs in this vault: (.+)\.)?$/i,
  );
  if (missingSlug) {
    const [, subject, slug, similarText] = missingSlug;
    const hasCreateHint = /add_concept\(slug, kind, title\)/.test(message);
    return omitUndefined({
      missingSubject: subject,
      missingSlug: slug,
      recoveryTools: ['list_concepts', 'find_evidence'],
      createTool: hasCreateHint ? 'add_concept' : undefined,
      similarSlugs: similarText ? extractQuotedList(similarText) : [],
    });
  }

  const unresolvedCompiledSlug = message.match(
    /^(.+?) "([^"]+)" does not resolve to a compiled ontology node\.(?: Did you mean: (.+)\?)?$/i,
  );
  if (unresolvedCompiledSlug) {
    const [, subject, slug, similarText] = unresolvedCompiledSlug;
    return {
      missingSubject: subject,
      missingSlug: slug,
      recoveryTools: ['list_concepts', 'find_evidence'],
      createTool: 'add_concept',
      similarSlugs: similarText ? splitCommaList(similarText) : [],
    };
  }

  const existingDoc = message.match(
    /^Doc already exists at "([^"]+)"\. To update fields, use patch_concept\(slug, frontmatter, body, expected_mtime\)\. To rename, use rename_concept\(oldSlug, newSlug\)\. Never delete-then-add/i,
  );
  if (existingDoc) {
    return {
      conflictSubject: 'Doc already exists',
      conflictSlug: existingDoc[1],
      recoveryTools: ['patch_concept', 'rename_concept'],
      avoidTools: ['delete_concept'],
    };
  }

  const existingTarget = message.match(
    /^Target slug already exists: "([^"]+)"\. Pass overwrite: true to replace it\.$/i,
  );
  if (existingTarget) {
    return {
      conflictSubject: 'Target slug already exists',
      conflictSlug: existingTarget[1],
      recoveryTools: ['rename_concept'],
      overwriteOption: 'overwrite',
    };
  }

  return {};
}

function structuredRowErrorDetails(err, message) {
  return {
    errorCode: classifyErrorCode(err, message),
    ...structuredErrorDetails(message),
  };
}

function extractUnknownArgumentHints(text) {
  return [...text.matchAll(/"([^"]+)"(?: \(did you mean "([^"]+)"\?\))?/g)].map((match) => omitUndefined({
    name: match[1],
    suggestion: match[2],
  }));
}

function splitCommaList(text) {
  if (text === 'no arguments' || text === 'none') return [];
  return String(text)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractQuotedList(text) {
  return [...String(text).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function parseReceivedValueText(text) {
  const value = String(text).trim();
  const quoted = value.match(/^"([\s\S]*)"$/);
  return quoted ? quoted[1] : value;
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function classifyErrorCode(err, message) {
  if (err instanceof VaultConflictError || err?.code === 'VAULT_CONFLICT') {
    return 'vault_conflict';
  }
  if (/^Unknown tool:/i.test(message)) return 'unknown_tool';
  if (/^Unknown argument /i.test(message) || /^Unknown arguments for /i.test(message)) {
    return 'unknown_argument';
  }
  if (/^Unknown field /i.test(message) || /^Unknown fields in /i.test(message)) {
    return 'invalid_arguments';
  }
  if (/not found|does not exist|does not resolve to a compiled ontology node/i.test(message)) {
    return 'not_found';
  }
  if (/already exists|conflict|identical/i.test(message)) return 'conflict';
  if (/must be|must not|cannot be|requires exactly one of|At least one|Invalid value|Received:|points outside|Too many/i.test(message)) {
    return 'invalid_arguments';
  }
  return 'tool_error';
}

export {
  RESPONSE_TEXT_BUDGET_BYTES,
  callerChoseSize,
  formatUnknownToolError,
  ok,
  okResponseBytes,
  error,
  structuredRowErrorDetails,
};
