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

function ok(result) {
  const compactPrompt = result?.contract === 'agentBriefCompact:v2'
    && typeof result?.handoffPrompt === 'string'
    ? result.handoffPrompt
    : null;
  const response = {
    content: [{ type: 'text', text: compactPrompt ?? JSON.stringify(result, null, 2) }],
  };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    response.structuredContent = result;
  }
  return response;
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
  formatUnknownToolError,
  ok,
  error,
  structuredErrorDetails,
  structuredRowErrorDetails,
  extractUnknownArgumentHints,
  splitCommaList,
  extractQuotedList,
  parseReceivedValueText,
  omitUndefined,
  classifyErrorCode,
};
