// The corpus, as code: `write-corpus.mjs` turns these definitions into the JSON-lines files under
// `tests/differential/corpus/`. Edit here, regenerate, commit both; the check refuses a stale corpus.
//
// A step is a JSON-RPC request (`req`, `call`), a notification, a raw line or a `$` directive.
// Strings may hold `$VAULT` (the vault folder), `$PARENT` (its parent) and, as a whole value,
// `$MTIME(<path inside the vault>)`, the file's modification time when the step is sent, or
// `$ANSWER(<request id>, <path>)`, a value out of the answer already received. A step labelled with
// `{ as: 'name' }` is named in `answerOf('name', path)`; the label becomes its request id here.
// Use `$MTIME` for a file the server has not written (its time is planted) and `answerOf` for one it
// has, so what the client sends back is what the server reported. Every case of the `vault-read` and
// `writes` families also runs a second time under a clock far in the future (`-late-clock`), because
// the document cache trusts a file only when it was written long before "now".
import { readFileSync } from 'node:fs';

import { docxCutShort, docxOf, docxPastTheUnpackBudget, xlsxOf } from './office-fixtures.mjs';
import { LATE_CLOCK_MS } from './servers.mjs';

const AUTO = Symbol('auto');
const LATE_CLOCK_FAMILIES = new Set(['vault-read', 'writes']);

const req = (method, params, extra = {}) => ({ id: AUTO, method, ...(params === undefined ? {} : { params }), ...extra });
const call = (tool, args = {}, extra = {}) => req('tools/call', { name: tool, arguments: args }, extra);
const mtimeOf = (relative) => `$MTIME(${relative})`;
const answerOf = (label, pathInAnswer) => `$ANSWER(@${label}, ${pathInAnswer})`;

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];

const cases = [];
function add(family, name, header, steps) {
  cases.push({ family, name, header: { case: name, ...header }, steps });
}

// ---------------------------------------------------------------------------------------------
// shell: the protocol loop, the registry and the answers every client sees first
// ---------------------------------------------------------------------------------------------

for (const version of [...PROTOCOL_VERSIONS, '2099-01-01', '1999-12-31', '2025-06-18-draft', '']) {
  add('shell', `initialize-${version || 'empty-version'}`, { vault: 'one-node', handshake: false }, [
    req('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'differential', version: '1' } }),
    { notify: 'notifications/initialized' },
    req('tools/list'),
    call('list_concepts', { limit: 3 }),
  ]);
}
add('shell', 'initialize-with-client-capabilities', { vault: 'one-node', handshake: false }, [
  req('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: { elicitation: { form: {} }, sampling: {}, roots: { listChanged: true }, experimental: { x: {} } },
    clientInfo: { name: 'rich-client', version: '9.9', title: 'Rich Client' },
  }),
  { notify: 'notifications/initialized' },
  req('tools/list'),
]);
add('shell', 'initialize-malformed-params', { vault: 'one-node', handshake: false }, [
  req('initialize', {}),
  req('initialize', { protocolVersion: 5, capabilities: {}, clientInfo: {} }),
  req('initialize', { protocolVersion: '2025-06-18' }),
  req('initialize'),
  req('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'late', version: '1' } }),
  req('tools/list'),
]);
add('shell', 'request-before-initialize', { vault: 'one-node', handshake: false }, [
  req('tools/list'),
  call('list_concepts', {}),
  req('ping'),
  req('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'late', version: '1' } }),
  req('tools/list'),
]);
add('shell', 'ping-and-unknown-methods', { vault: 'one-node' }, [
  req('ping'),
  req('resources/list'),
  req('resources/templates/list'),
  req('prompts/list'),
  req('completion/complete', { ref: { type: 'ref/prompt', name: 'x' }, argument: { name: 'a', value: '' } }),
  req('logging/setLevel', { level: 'info' }),
  req('no/such/method', { a: 1 }),
  req('tools/list', { cursor: 'nonsense' }),
  req('tools/list', { cursor: 5 }),
  req('tasks/list'),
]);
add('shell', 'wrong-parameter-types', { vault: 'one-node' }, [
  req('tools/call', { name: 5, arguments: {} }),
  req('tools/call', { name: 'list_concepts', arguments: 'text' }),
  req('tools/call', { name: 'list_concepts', arguments: [] }),
  req('tools/call', { name: 'list_concepts', arguments: null }),
  req('tools/call', {}),
  req('tools/call'),
  req('tools/call', 'text', { timeoutMs: 1500 }),
  req('tools/call', [1, 2], { timeoutMs: 1500 }),
  req('tools/call', { name: 'list_concepts', arguments: { limit: '3' } }),
  req('tools/call', { name: 'list_concepts', arguments: { limit: 3.5 } }),
  req('tools/call', { name: 'list_concepts', arguments: { limit: -1 } }),
  req('tools/call', { name: 'list_concepts', arguments: { limit: 1e21 } }),
  req('tools/call', { name: 'list_concepts', arguments: { kind: ['a'] } }),
  req('tools/call', { name: 'list_concepts', _meta: { progressToken: 7 }, arguments: { limit: 1 } }),
  req('tools/call', { name: 'list_concepts', arguments: { limit: 1 }, extra: true }),
]);
add('shell', 'lines-that-are-not-requests', { vault: 'one-node' }, [
  { raw: 'this is not json' },
  { raw: '' },
  { raw: '[]' },
  { raw: '[{"jsonrpc":"2.0","id":9,"method":"ping"},{"jsonrpc":"2.0","id":10,"method":"ping"}]' },
  { raw: '{"jsonrpc":"2.0","id":null,"method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":1.5,"method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":"7","method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":true,"method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}' },
  { raw: '{"jsonrpc":"1.0","id":11,"method":"ping"}' },
  { raw: '{"id":12,"method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":13}' },
  { raw: '{"jsonrpc":"2.0","id":14,"method":5}' },
  { raw: '{"jsonrpc":"2.0","method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":15,"result":{}}' },
  { raw: '{"jsonrpc":"2.0","id":16,"error":{"code":-1,"message":"x"}}' },
  { raw: '{"jsonrpc":"2.0","id":17,"method":"ping"' },
  { raw: '\ufeff{"jsonrpc":"2.0","id":18,"method":"ping"}' },
  { raw: '   {"jsonrpc":"2.0","id":19,"method":"ping"}   ' },
  req('ping'),
]);
add('shell', 'large-and-odd-ids', { vault: 'one-node' }, [
  { raw: '{"jsonrpc":"2.0","id":9007199254740993,"method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":-0,"method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":1e3,"method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":"\\u00e9\\ud83d\\ude00","method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":"","method":"ping"}' },
  { raw: `{"jsonrpc":"2.0","id":"${'x'.repeat(2000)}","method":"ping"}` },
  req('ping'),
]);
add('shell', 'arguments-nested-thousands-deep', { vault: 'one-node' }, [
  { raw: `{"jsonrpc":"2.0","id":501,"method":"tools/call","params":{"name":"list_concepts","arguments":{"kind":${'['.repeat(3000)}${']'.repeat(3000)}}}}` },
  { raw: `{"jsonrpc":"2.0","id":502,"method":"tools/call","params":{"name":"list_concepts","arguments":{"filter":"kind=x","deep":${'{"a":'.repeat(2500)}1${'}'.repeat(2500)}}}}` },
  { raw: `{"jsonrpc":"2.0","id":503,"method":"tools/call","params":{"name":"patch_concept","arguments":{"slug":"only","frontmatter":${'{"a":'.repeat(2500)}1${'}'.repeat(2500)}}}}` },
  req('ping'),
]);
add('shell', 'cancel-during-a-tool-call', { vault: 'atlas-ontology' }, [
  call('validate_vault', {}, { noWait: true, timeoutMs: 12000 }),
  { notify: 'notifications/cancelled', params: { requestId: 1, reason: 'changed my mind' } },
  { $: 'await', id: 1 },
  req('ping'),
  { notify: 'notifications/cancelled', params: { requestId: 999 } },
  { notify: 'notifications/cancelled', params: {} },
  { notify: 'notifications/progress', params: { progressToken: 1, progress: 0.5 } },
  { notify: 'notifications/roots/list_changed' },
  req('ping'),
]);
add('shell', 'tools-list-profiles', { vault: 'storefront' }, [req('tools/list')]);
for (const [label, env] of [
  ['read-only-1', { OATLAS_READ_ONLY: '1' }],
  ['read-only-true', { OATLAS_READ_ONLY: 'TRUE' }],
  ['read-only-yes-padded', { OATLAS_READ_ONLY: ' yes ' }],
  ['read-only-on', { OATLAS_READ_ONLY: 'on' }],
  ['read-only-zero', { OATLAS_READ_ONLY: '0' }],
  ['read-only-empty', { OATLAS_READ_ONLY: '' }],
  ['read-only-word', { OATLAS_READ_ONLY: 'enabled' }],
  ['profile-full', { OATLAS_TOOL_PROFILE: 'full' }],
  ['profile-construction', { OATLAS_TOOL_PROFILE: 'construction' }],
  ['profile-unknown', { OATLAS_TOOL_PROFILE: 'everything' }],
  ['profile-construction-read-only', { OATLAS_TOOL_PROFILE: 'construction', OATLAS_READ_ONLY: '1' }],
  ['consent-on', { OATLAS_WRITE_CONSENT: '1' }],
]) {
  add('shell', `tools-list-${label}`, { vault: 'storefront', env }, [
    req('tools/list'),
    call('add_concepts', { concepts: [{ slug: 'elements/probe', kind: 'element', title: 'Probe' }] }),
    call('list_concepts', { limit: 1 }),
  ]);
}
add('shell', 'retired-tool-names', { vault: 'storefront' }, [
  call('find_neighbors', { slug: 'capabilities/cart' }),
  call('find_path', { from: 'capabilities/cart', to: 'capabilities/checkout' }),
  call('get_concept', { slug: 'capabilities/cart' }),
  call('list_kinds'),
  call('index_project', {}),
  call('add_relation', { from: 'capabilities/cart', to: 'capabilities/checkout', type: 'depends_on', why: 'x' }),
  call('list_nodes'),
  call('git_status', {}),
  call('git_history', {}),
  call('git_snapshot', {}),
  call('list_constellations', {}),
  call('find_evidence', { title: 'cart' }),
  call('find_orphans', {}),
  call('query_concepts', { filter: 'kind=capability' }),
  call('replace_relation', { from: 'capabilities/checkout', oldTo: 'capabilities/cart', oldType: 'depends_on', newTo: 'capabilities/faq', newType: 'depends_on', why: 'x' }),
  call('reclassify_concept', { slug: 'capabilities/cart', newKind: 'element' }),
]);
add('shell', 'unknown-tool-and-arguments', { vault: 'storefront' }, [
  call('no_such_tool', {}),
  call('', {}),
  call('LIST_CONCEPTS', {}),
  call('list_concepts ', {}),
  call('__proto__', {}),
  call('constructor', {}),
  call('toString', {}),
  call('list_concepts', { nonsense: 1 }),
  call('list_concepts', { limit: 1, nonsense: 1, other: 2 }),
  { raw: '{"jsonrpc":"2.0","id":801,"method":"tools/call","params":{"name":"list_concepts","arguments":{"__proto__":{"limit":1}}}}' },
  { raw: '{"jsonrpc":"2.0","id":802,"method":"tools/call","params":{"name":"list_concepts","arguments":{"constructor":{"prototype":{"polluted":true}}}}}' },
  call('get_concepts', { slugs: ['capabilities/cart'], constructor: 1 }),
  call('connection_info', { guide: 'nonsense' }),
  call('find_backlinks', {}),
  call('find_backlinks', { slug: '' }),
  call('find_backlinks', { slug: 5 }),
  call('query_ontology', { operation: 'nonsense' }),
  call('query_ontology', {}),
  call('list_concepts', { filter: '' }),
  call('list_concepts', { filter: 'kind=' }),
  call('list_concepts', { filter: 'AND AND' }),
]);
// Half of a surrogate pair in a name, in an argument, and in a request id (declared change 3). Ids
// can only be sent as raw lines, so their answers are compared as the server's other messages.
add('shell', 'half-a-surrogate-pair-in-a-name-and-arguments', { vault: 'storefront' }, [
  call('a\ud800b', {}),
  call('list_concepts', { domain: 'x\ud800' }),
  call('get_concepts', { slugs: ['capabilities/cart', '\udc00'] }),
  call('get_concepts', { slugs: ['capabilities/cart'], slugss: '\ud800' }),
  req('ping'),
]);
add('shell', 'half-a-surrogate-pair-in-a-request-id', { vault: 'storefront' }, [
  { raw: '{"jsonrpc":"2.0","id":"i\\ud800","method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":"\\ud83d","method":"ping"}' },
  { raw: '{"jsonrpc":"2.0","id":"\\ud83d\\ude00","method":"ping"}' },
  req('ping'),
]);
// Names an agent sends that the answer must carry as sent (declared change 4).
add('shell', 'unknown-names-in-any-form', { vault: 'storefront' }, [
  call('srv.list_concepts', {}),
  call('ontology-atlas.list_concepts', {}),
  call('list_concepts', { 'a,b': 1, ' c ': 2 }),
  call('list_concepts', { 'q"x': 1 }),
  call('list_concepts', { '': 1 }),
  call('list_concepts', { limit: 1, '': 2, zz: 3 }),
  req('ping'),
]);
// Arguments reach the server in the order the line holds them; a script object would list integer
// names first before the line is written, so this one is a raw line (declared change 5).
add('shell', 'unknown-arguments-sent-in-any-order', { vault: 'storefront' }, [
  { raw: '{"jsonrpc":"2.0","id":702,"method":"tools/call","params":{"name":"list_concepts","arguments":{"b":1,"2":2,"1":3}}}' },
  req('ping'),
]);
add('shell', 'missing-vault-root', { vault: 'one-node', env: { OATLAS_VAULT: '$VAULT/does-not-exist' }, handshake: false }, [req('ping')]);
add('shell', 'vault-root-is-a-file', { vault: 'one-node', env: { OATLAS_VAULT: '$VAULT/only.md' }, handshake: false }, [req('ping')]);
add('shell', 'vault-root-is-empty-string-uses-cwd', { vault: 'one-node', env: { OATLAS_VAULT: '' }, cwd: 'vault' }, [
  call('connection_info', {}),
  call('list_concepts', {}),
]);
add('shell', 'vault-root-from-working-directory', { vault: 'storefront', env: { OATLAS_VAULT: null }, cwd: 'vault' }, [
  call('connection_info', {}),
  call('list_concepts', { limit: 2 }),
]);
add('shell', 'vault-root-relative', { vault: 'one-node', env: { OATLAS_VAULT: '../vault' }, cwd: 'vault' }, [call('connection_info', {})]);
add('shell', 'vault-root-with-spaces-and-hangul', { vault: 'one-node', env: { OATLAS_VAULT: '$VAULT/../\ub2e4\ub978 \ubcfc\ud2b8 dir' } }, [call('connection_info', {})]);
add('shell', 'repo-root-from-environment', { vault: 'miniature-repo', env: { OATLAS_REPO_ROOT: '$PARENT' } }, [
  call('connection_info', {}),
]);
add('shell', 'repo-root-missing', { vault: 'miniature-repo', env: { OATLAS_REPO_ROOT: '$PARENT/gone' } }, [
  call('connection_info', {}),
  call('validate_vault', {}),
]);
add('shell', 'standard-input-closes-at-once', { vault: 'one-node', handshake: false }, [{ $: 'close-stdin' }]);
add('shell', 'standard-input-closes-after-initialize', { vault: 'one-node' }, [{ $: 'close-stdin' }]);
add('shell', 'standard-output-closed-by-client', { vault: 'one-node' }, [
  { $: 'close-stdout' },
  { raw: '{"jsonrpc":"2.0","id":77,"method":"ping"}', settleMs: 500 },
  { raw: '{"jsonrpc":"2.0","id":78,"method":"tools/call","params":{"name":"list_concepts","arguments":{}}}', settleMs: 500 },
]);
add('shell', 'connection-info-guides', { vault: 'storefront' }, [
  call('connection_info', {}),
  ...['meta_model', 'construction', 'write_safety', 'workflows', 'competency'].map((guide) => call('connection_info', { guide })),
]);
add('shell', 'handshake-only-then-end', { vault: 'one-node' }, []);

// Every tool refused for a bad argument shape, from its own schema, on a vault where nothing is written.
const ALL_TOOLS = [
  'connection_info', 'list_concepts', 'get_constellation', 'get_concepts', 'finalize_project_meaning',
  'connect_project_source', 'add_concepts', 'add_relations', 'remove_relation', 'patch_concept',
  'find_backlinks', 'compile_ontology', 'query_ontology', 'validate_vault', 'validate_wiki', 'read_source',
  'inspect_architecture', 'infer_imports', 'analyze_repo_structure', 'rename_concept', 'merge_concepts',
  'delete_concept', 'absorb_document',
];
add('shell', 'every-tool-with-an-unknown-argument', { vault: 'one-node', env: { OATLAS_READ_ONLY: '1' } }, ALL_TOOLS.map((tool) => call(tool, { zzUnknown: 1 })));
add('shell', 'every-tool-with-wrong-argument-type', { vault: 'one-node', env: { OATLAS_READ_ONLY: '1' } }, ALL_TOOLS.map((tool) => call(tool, 'text')));
add('shell', 'every-tool-in-read-only-mode', { vault: 'one-node', env: { OATLAS_READ_ONLY: '1' } }, ALL_TOOLS.map((tool) => call(tool, {})));
add('shell', 'every-tool-with-empty-arguments-profile-construction', { vault: 'one-node', env: { OATLAS_TOOL_PROFILE: 'construction', OATLAS_READ_ONLY: '1' } }, ALL_TOOLS.map((tool) => call(tool)));

// ---------------------------------------------------------------------------------------------
// vault-read: documents and plain reads
// ---------------------------------------------------------------------------------------------

const STOREFRONT_SLUGS = ['storefront', 'domains/order', 'domains/payment', 'capabilities/cart', 'capabilities/checkout', 'capabilities/order-cancel', 'architecture/storefront-services'];
const READ_VAULTS = ['storefront', 'edge-names', 'edge-bytes', 'empty', 'one-node', 'edge-hostile', 'library', 'miniature-repo'];

for (const vault of READ_VAULTS) {
  add('vault-read', `list-concepts-${vault}`, { vault }, [
    call('list_concepts', {}),
    call('list_concepts', { summary: true }),
    call('list_concepts', { limit: 1 }),
    call('list_concepts', { limit: 2, offset: 1 }),
    call('list_concepts', { offset: 9999 }),
    call('list_concepts', { kind: 'capability' }),
    call('list_concepts', { kind: 'domain', summary: true }),
    call('list_concepts', { kind: 'nonsense' }),
    call('list_concepts', { domain: 'domains/order' }),
    call('list_concepts', { domain: 'domains/\uacb0\uc81c' }),
    call('list_concepts', { since: 1_700_000_100_000 }),
    call('list_concepts', { since: 1_700_000_100_000.5 }),
    call('list_concepts', { since: 0, limit: 500 }),
    call('list_concepts', { since: -1 }),
  ]);
}
add('vault-read', 'list-concepts-atlas-ontology', { vault: 'atlas-ontology' }, [
  call('list_concepts', {}),
  call('list_concepts', { summary: true, limit: 20 }),
  call('list_concepts', { kind: 'capability', limit: 10, offset: 5 }),
  call('list_concepts', { since: 1_700_000_050_000 }),
]);
add('vault-read', 'get-concepts-storefront', { vault: 'storefront' }, [
  call('get_concepts', { slugs: STOREFRONT_SLUGS }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'full' }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'summary' }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'none' }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'sections' }),
  call('get_concepts', { slugs: ['capabilities/cart.md'] }),
  call('get_concepts', { slugs: ['Capabilities/Cart'] }),
  call('get_concepts', { slugs: ['capabilities/car'] }),
  call('get_concepts', { slugs: ['capabilities/nonexistent-thing'] }),
  call('get_concepts', { slugs: [] }),
  call('get_concepts', { slugs: ['capabilities/cart', 'capabilities/cart'] }),
  call('get_concepts', { uids: ['b000aa3e-d9da-4e0d-bcc1-644934df42f1'] }),
  call('get_concepts', { uids: ['00000000-0000-4000-8000-000000000000'] }),
  call('get_concepts', { uids: ['not-a-uid'] }),
  call('get_concepts', { slugs: ['capabilities/cart'], uids: ['b000aa3e-d9da-4e0d-bcc1-644934df42f1'] }),
  call('get_concepts', {}),
  call('get_concepts', { slugs: Array.from({ length: 60 }, (_, i) => `capabilities/missing-${i}`) }),
]);
for (const vault of ['edge-names', 'edge-bytes', 'edge-hostile', 'library', 'miniature-repo', 'one-node']) {
  const slugs = {
    'edge-names': ['atlas-edge', 'domains/\uacb0\uc81c', 'domains/\uc6d0\uc7a5'.normalize('NFD'), 'domains/\uc6d0\uc7a5', 'capabilities/\uc8fc\ubb38-\ucde8\uc18c', 'capabilities/Éclair', 'capabilities/Éclair'.normalize('NFD'), 'capabilities/\uac00\ub098\ub2e4', 'capabilities/ｆｕｌｌ-width', 'domains/😀-smile'],
    'edge-bytes': ['capabilities/crlf', 'capabilities/bom', 'capabilities/numbers', 'capabilities/prototype-keys', 'capabilities/no-final-newline', 'capabilities/unicode-separators', 'invalid-utf8', 'capabilities/nul-byte', 'empty-file', 'frontmatter-only', 'duplicate-keys', 'notes/plain'],
    'edge-hostile': ['hostile', 'escape-file', 'escape-dir/secret', 'inside-link', 'absolute-link', 'loop-a', 'secrets', 'oversized', 'inside-hidden', '.hidden/inside-hidden', 'ignored/inside', 'note.skip', 'capital', 'Capital'],
    library: ['library', 'capabilities/annotate', 'wiki/plan', 'wiki/broken', 'sources/notes'],
    'miniature-repo': ['miniature-shop', 'capabilities/place-order', 'capabilities/cancel-order', 'capabilities/charge-card'],
    'one-node': ['only'],
  }[vault];
  add('vault-read', `get-concepts-${vault}`, { vault }, [
    call('get_concepts', { slugs }),
    ...slugs.map((slug) => call('get_concepts', { slugs: [slug], body: 'full' })),
  ]);
}
for (const vault of ['storefront', 'edge-names', 'edge-bytes', 'edge-hostile', 'library', 'miniature-repo', 'empty']) {
  const slugs = vault === 'storefront' ? ['capabilities/cart', 'domains/order', 'storefront', 'capabilities/nonexistent']
    : vault === 'edge-names' ? ['capabilities/cancel-order', 'domains/\uacb0\uc81c', 'capabilities/\uc8fc\ubb38-\ucde8\uc18c', 'domains/Zebra']
      : vault === 'miniature-repo' ? ['capabilities/charge-card', 'domains/order']
        : ['capabilities/normal', 'domains/inside', 'capabilities/annotate', 'domains/bytes'];
  add('vault-read', `backlinks-and-orphans-${vault}`, { vault }, [
    ...slugs.map((slug) => call('find_backlinks', { slug })),
    call('query_ontology', { operation: 'match_nodes', hasIncoming: false }),
    call('query_ontology', { operation: 'match_nodes', hasIncoming: false, kind: 'capability' }),
    call('query_ontology', { operation: 'match_nodes', hasIncoming: false, kind: 'element' }),
    call('query_ontology', { operation: 'match_nodes', hasIncoming: false, kind: 'nonsense' }),
  ]);
}
const FILTERS = [
  'kind=capability', 'kind=domain', 'kind!=capability', 'kind=capability AND has(elements)', 'kind=capability AND NOT has(elements)',
  'has(dependencies)', 'NOT has(dependencies)', 'kind=domain OR kind=project', 'slug=capabilities/cart', 'title="Shopping Cart"',
  'title=\'Shopping Cart\'', 'KIND=Capability', 'kind = capability', 'domain=domains/order',
  'title=\uacb0\uc81c', 'title="\uc8fc\ubb38 \ucde8\uc18c"', 'has(review_state)', 'kind=capability AND domain=domains/order AND NOT has(elements)',
  'kind=capability OR kind=domain AND has(elements)', 'NOT NOT kind=domain', '', 'kind', 'has()', 'has(x', 'kind=capability AND', 'slug=*', 'title=""',
  'kind=capability AND kind=domain', 'has(__proto__)', 'has(constructor)', 'kind=\u00e9', 'kind="unterminated',
];
for (const vault of ['storefront', 'edge-names', 'edge-bytes', 'miniature-repo', 'empty']) {
  add('vault-read', `query-concepts-${vault}`, { vault }, [
    ...FILTERS.map((filter) => call('list_concepts', { filter })),
    call('list_concepts', { filter: 'kind=capability', limit: 1 }),
    call('list_concepts', { filter: 'kind=capability', limit: 500 }),
    call('list_concepts', { filter: 'kind=capability', limit: 501 }),
    call('list_concepts', { filter: 'kind=capability', limit: 0 }),
  ]);
}
// A domain named in Hangul matches rows in this vault, so its zero-row hint is not in question.
add('vault-read', 'query-concepts-hangul-domain', { vault: 'edge-names' }, [
  call('list_concepts', { filter: 'domain=domains/\uacb0\uc81c' }),
  call('list_concepts', { filter: 'domain=domains/\uacb0\uc81c AND kind=capability' }),
]);
// A filter is read by recursion, so the Rust server refuses one nested deeper than 32 levels of NOT
// and brackets or holding more than 256 clauses; the JavaScript server reads any until its stack ends.
add('vault-read', 'query-concepts-filter-bounds', { vault: 'storefront' }, [
  call('list_concepts', { filter: `${'NOT '.repeat(32)}kind=domain` }),
  call('list_concepts', { filter: `${'NOT '.repeat(33)}kind=domain` }),
  call('list_concepts', { filter: Array(256).fill('kind=domain').join(' AND ') }),
  call('list_concepts', { filter: Array(257).fill('kind=domain').join(' AND ') }),
]);
// The names a zero-row hint reports come from the parsed filter: a name inside a quoted title is not a
// kind, and a domain with a non-ASCII letter is named whole.
add('vault-read', 'query-concepts-zero-row-names', { vault: 'storefront' }, [
  call('list_concepts', { filter: 'title="kind=widget" AND kind=domain' }),
  call('list_concepts', { filter: 'domain=domains/\uc5c6\ub294-\ub3c4\uba54\uc778' }),
  call('list_concepts', { filter: 'kind=domain AND domain=domains/nothing-here' }),
  call('list_concepts', { filter: 'NOT kind=domain AND kind=capability AND slug=x' }),
]);
add('vault-read', 'connection-info-on-each-vault', { vault: 'storefront' }, [call('connection_info', {})]);
for (const vault of ['edge-names', 'edge-hostile', 'miniature-repo', 'library', 'atlas-ontology', 'empty']) {
  add('vault-read', `connection-info-${vault}`, { vault }, [call('connection_info', {}), call('connection_info', { guide: 'construction' })]);
}
add('vault-read', 'reads-see-a-file-changed-between-calls', { vault: 'storefront' }, [
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'full' }),
  { $: 'write-file', path: 'capabilities/cart.md', text: '---\nuid: b000aa3e-d9da-4e0d-bcc1-644934df42f1\nslug: capabilities/cart\nkind: capability\ntitle: Rewritten Behind The Server\ndomain: domains/order\n---\n\nChanged on disk.\n' },
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'full' }),
  call('list_concepts', { kind: 'capability', limit: 3 }),
  { $: 'write-file', path: 'capabilities/brand-new.md', text: '---\nuid: 11111111-2222-4333-8444-555555555555\nslug: capabilities/brand-new\nkind: capability\ntitle: Brand New\ndomain: domains/order\n---\n\nNew.\n' },
  call('list_concepts', { kind: 'capability', limit: 500, summary: true }),
  call('find_backlinks', { slug: 'capabilities/brand-new' }),
]);
add('vault-read', 'since-compares-planted-times', { vault: 'storefront' }, [
  call('list_concepts', { since: 1_700_000_000_000 }),
  call('list_concepts', { since: 1_700_000_001_000, limit: 3 }),
  call('list_concepts', { since: 1_700_000_001_000.3125, limit: 3 }),
  call('list_concepts', { since: 1_700_000_002_000.5, limit: 3 }),
  call('list_concepts', { since: 1_700_000_002_000.4999, limit: 3 }),
  call('list_concepts', { since: 1_700_000_002_000.5001, limit: 3 }),
  call('list_concepts', { since: 1_700_000_000_000.5, summary: true, limit: 4 }),
  call('list_concepts', { since: 5e307 }),
  call('list_concepts', { since: 1e21 }),
]);

// ---------------------------------------------------------------------------------------------
// graph: compile_ontology and query_ontology
// ---------------------------------------------------------------------------------------------

const GRAPH_VAULTS = ['storefront', 'edge-names', 'edge-bytes', 'miniature-repo', 'library', 'empty', 'one-node'];
for (const vault of GRAPH_VAULTS) {
  add('graph', `compile-ontology-${vault}`, { vault }, [
    call('compile_ontology', {}),
    call('compile_ontology', { summary: true }),
    call('compile_ontology', { full: true }),
    call('compile_ontology', { includeIndexes: true }),
    call('compile_ontology', { nodesLimit: 3, nodesOffset: 1, edgesLimit: 2, edgesOffset: 1 }),
    call('compile_ontology', { nodesLimit: 1000 }),
    call('compile_ontology', { nodesOffset: 99999 }),
    call('compile_ontology', { summary: true, full: true }),
  ]);
}
const QUERY_STOREFRONT = [
  { operation: 'overview' }, { operation: 'schema' }, { operation: 'facets' }, { operation: 'health' },
  { operation: 'workspace_brief' }, { operation: 'components' }, { operation: 'cycles' },
  { operation: 'communities' }, { operation: 'containment_tree' },
  { operation: 'growth_plan' }, { operation: 'maintenance_plan' },
  { operation: 'neighbors', slug: 'capabilities/checkout' }, { operation: 'neighbors', slug: 'capabilities/checkout', direction: 'in', depth: 2 },
  { operation: 'neighbors', slug: 'capabilities/checkout', types: ['depends_on'], direction: 'out' },
  { operation: 'path', from: 'capabilities/cart', to: 'capabilities/order-cancel' },
  { operation: 'path', from: 'capabilities/cart', to: 'capabilities/does-not-exist' },
  { operation: 'reachability', from: 'capabilities/checkout' },
  { operation: 'pattern_walk', from: 'capabilities/checkout', pattern: ['depends_on', 'depends_on'] },
  { operation: 'impact', slug: 'capabilities/order-placement' }, { operation: 'blast_radius', slug: 'capabilities/order-placement' },
  { operation: 'subgraph', slug: 'domains/order', depth: 1 },
  { operation: 'similar_nodes', slug: 'capabilities/cart' }, { operation: 'explain_relation', from: 'capabilities/cart', to: 'capabilities/checkout' },
  { operation: 'match_nodes', kind: 'capability', sort: 'degree', limit: 5 }, { operation: 'match_nodes', domain: 'domains/order', hasIncoming: false },
  { operation: 'node_profile', slug: 'capabilities/cart' },
  { operation: 'project_scope', project: 'storefront' }, { operation: 'project_map', project: 'storefront' },
  { operation: 'relation_check', from: 'capabilities/cart', to: 'capabilities/checkout', type: 'depends_on' },
  { operation: 'lineage', slug: 'capabilities/cart' }, { operation: 'recommend_relations', slug: 'capabilities/cart' },
  { operation: 'analysis_record', recordId: 'none' },
  { operation: 'query_plan', targetOperation: 'neighbors', slug: 'capabilities/checkout' },
  { operation: 'neighbors' }, { operation: 'path', from: 'capabilities/cart' },
  { operation: 'overview', limit: 1 }, { operation: 'match_nodes', limit: 2, cursor: 'x' },
];
add('graph', 'query-ontology-storefront', { vault: 'storefront' }, QUERY_STOREFRONT.map((args) => call('query_ontology', args)));
add('graph', 'query-ontology-tangle', { vault: 'tangle' }, [
  { operation: 'overview' }, { operation: 'schema' }, { operation: 'facets' }, { operation: 'components' },
  { operation: 'cycles' }, { operation: 'cycles', maxHops: 3 }, { operation: 'cycles', limit: 1 },
  { operation: 'cycles', searchBudget: 5 }, { operation: 'cycles', types: ['depends_on'] },
  { operation: 'communities' }, { operation: 'communities', types: ['depends_on'] }, { operation: 'communities', limit: 2 },
  { operation: 'neighbors', slug: 'capabilities/b' }, { operation: 'neighbors', slug: 'capabilities/b', direction: 'in', depth: 3 },
  { operation: 'neighbors', slug: 'capabilities/b', direction: 'both', depth: 20, limit: 3 },
  { operation: 'path', from: 'capabilities/l', to: 'capabilities/g' }, { operation: 'path', from: 'capabilities/g', to: 'capabilities/l' },
  { operation: 'path', from: 'capabilities/a', to: 'capabilities/a' }, { operation: 'path', from: 'capabilities/a', to: 'capabilities/h' },
  { operation: 'path', from: 'capabilities/a', to: 'capabilities/g', direction: 'both', maxHops: 2 },
  { operation: 'neighbors', slug: 'capabilites/b' }, { operation: 'path', from: 'capabilities/a', to: 'capabilities/z' },
  { operation: 'cycles', maxHops: 21 }, { operation: 'neighbors', slug: 'capabilities/b', direction: 'up' },
].map((args) => call('query_ontology', args)));
add('graph', 'query-ontology-edge-names', { vault: 'edge-names' }, [
  { operation: 'overview' }, { operation: 'health' }, { operation: 'communities' }, { operation: 'containment_tree' },
  { operation: 'match_nodes', sort: 'title' }, { operation: 'match_nodes', sort: 'slug', limit: 30 }, { operation: 'similar_nodes', slug: 'capabilities/\uc8fc\ubb38-\ucde8\uc18c' },
  { operation: 'neighbors', slug: 'capabilities/\uc8fc\ubb38-\ucde8\uc18c' }, { operation: 'node_profile', slug: 'capabilities/\uac00\ub098\ub2e4' },
].map((args) => call('query_ontology', args)));
add('graph', 'query-ontology-miniature-repo', { vault: 'miniature-repo' }, [
  { operation: 'overview' }, { operation: 'health' }, { operation: 'workspace_brief' }, { operation: 'impact', slug: 'capabilities/charge-card' },
  { operation: 'cycles' }, { operation: 'growth_plan' }, { operation: 'maintenance_plan' },
].map((args) => call('query_ontology', args)));
add('graph', 'query-ontology-atlas-ontology', { vault: 'atlas-ontology' }, [
  { operation: 'overview' }, { operation: 'health' }, { operation: 'communities' }, { operation: 'cycles' },
  { operation: 'workspace_brief' }, { operation: 'growth_plan' },
].map((args) => call('query_ontology', args)));
add('graph', 'query-ontology-empty-and-one', { vault: 'empty' }, QUERY_STOREFRONT.slice(0, 18).map((args) => call('query_ontology', args)));
add('graph', 'query-ontology-recompiles-after-disk-change', { vault: 'storefront' }, [
  call('query_ontology', { operation: 'overview' }),
  { $: 'write-file', path: 'elements/new-element.md', text: '---\nuid: 22222222-3333-4444-8555-666666666666\nslug: elements/new-element\nkind: element\ntitle: New Element\n---\n\nAdded behind the server.\n' },
  call('query_ontology', { operation: 'overview' }),
  call('compile_ontology', { summary: true }),
]);

// Identity faults stop every graph command with one refusal naming the files.
for (const vault of ['identity-uid-missing', 'identity-uid-invalid', 'identity-uid-duplicate', 'identity-merged-collision']) {
  add('graph', `graph-refuses-${vault}`, { vault }, [
    call('compile_ontology', {}),
    call('query_ontology', { operation: 'overview' }),
    call('query_ontology', { operation: 'neighbors', slug: 'capabilities/a' }),
  ]);
}
// A vote that two names tie for is settled the same way on every machine.
add('graph', 'query-ontology-communities-ties', { vault: 'communities-ties' }, [
  { operation: 'communities' }, { operation: 'communities', limit: 1 },
  { operation: 'neighbors', slug: 'capabilities/a' },
].map((args) => call('query_ontology', args)));
// A node named for a whole number, and the ordered tables that name it.
add('graph', 'graph-numeric-names', { vault: 'numeric-names' }, [
  call('compile_ontology', { includeIndexes: true }),
  call('compile_ontology', { summary: true }),
  call('query_ontology', { operation: 'overview' }),
  call('query_ontology', { operation: 'schema' }),
]);
// Issues that do not stop the compile: a name two nodes answer to, references to nothing, a cycle.
add('graph', 'graph-ambiguous-and-dangling', { vault: 'ambiguous-dangling' }, [
  call('compile_ontology', { includeIndexes: true }),
  call('compile_ontology', { summary: true }),
  call('query_ontology', { operation: 'overview' }),
  call('query_ontology', { operation: 'cycles' }),
  call('query_ontology', { operation: 'neighbors', slug: 'capabilities/a', includeUnresolved: true, includeExternal: true }),
]);
// A topological order cut at `limit` cuts its blocked list too.
add('graph', 'query-ontology-tangle-limited-order', { vault: 'tangle' }, [
]);

// The walks that count what a node reaches and the operations that read containment: each with
// its defaults, its arguments and the calls an agent gets wrong.
const walksCase = (name, vault, queries) => add('graph', `graph-walks-${name}`, { vault }, queries.map((args) => call('query_ontology', args)));
walksCase('storefront', 'storefront', [
  { operation: 'reachability', slug: 'capabilities/checkout' },
  { operation: 'reachability', slug: 'capabilities/checkout', direction: 'both', depth: 2 },
  { operation: 'reachability', slug: 'capabilities/checkout', direction: 'undirected', depth: 1 },
  { operation: 'reachability', slug: 'capabilities/order-placement', direction: 'incoming', depth: 20, limit: 3 },
  { operation: 'reachability', slug: 'capabilities/checkout', types: ['depends_on'], limit: 1 },
  { operation: 'reachability', slug: 'domains/order', depth: 3, limit: 4 },
  { operation: 'reachability', slug: 'domains/order', depth: 1, limit: 500 },
  { operation: 'reachability', slug: 'capabilities/does-not-exist' },
  { operation: 'reachability' },
  { operation: 'reachability', slug: 'capabilities/checkout', types: ['bogus'] },
  { operation: 'pattern_walk', slug: 'domains/order', pattern: ['capabilities', 'dependencies'] },
  { operation: 'pattern_walk', slug: 'capabilities/checkout', pattern: ['depends_on', 'depends_on', 'depends_on'], direction: 'both' },
  { operation: 'pattern_walk', slug: 'capabilities/order-cancel', pattern: ['relates'] },
  { operation: 'pattern_walk', slug: 'domains/order', pattern: ['capabilities'], limit: 3 },
  { operation: 'pattern_walk', slug: 'domains/order', pattern: ['capabilities', 'domain'], direction: 'undirected', limit: 2 },
  { operation: 'pattern_walk', slug: 'capabilities/cart' },
  { operation: 'pattern_walk', slug: 'capabilities/cart', pattern: [] },
  { operation: 'pattern_walk', slug: 'capabilities/cart', pattern: ['bogus'] },
  { operation: 'impact', slug: 'capabilities/order-placement' },
  { operation: 'impact', slug: 'capabilities/checkout', direction: 'outgoing', depth: 3 },
  { operation: 'impact', slug: 'capabilities/product-detail', direction: 'undirected', depth: 1, limit: 2 },
  { operation: 'impact', slug: 'capabilities/product-detail', depth: 0 },
  { operation: 'impact', slug: 'capabilities/product-detail', types: ['depends_on', 'dependencies'] },
  { operation: 'impact', slug: 'capabilities/product-detail', types: ['relates', 'contains', 'relates'] },
  { operation: 'blast_radius', slug: 'capabilities/order-placement' },
  { operation: 'blast_radius', slug: 'capabilities/product-detail', depth: 4, limit: 3 },
  { operation: 'blast_radius', slug: 'capabilities/checkout', direction: 'both', depth: 3 },
  { operation: 'blast_radius', slug: 'capabilities/checkout', types: ['elements'] },
  { operation: 'subgraph', slug: 'domains/order', depth: 1 },
  { operation: 'subgraph', slug: 'capabilities/cart' },
  { operation: 'subgraph', slug: 'capabilities/cart', direction: 'incoming', depth: 3, limit: 5 },
  { operation: 'subgraph', slug: 'capabilities/cart', types: ['depends_on'], direction: 'outgoing' },
  { operation: 'subgraph', slug: 'capabilities/cart', limit: 1 },
  { operation: 'subgraph', slug: 'domains/order', depth: 2, limit: 500 },
  { operation: 'subgraph' },
  { operation: 'explain_relation', from: 'capabilities/cart', to: 'capabilities/checkout' },
  { operation: 'explain_relation', from: 'capabilities/checkout', to: 'capabilities/order-cancel' },
  { operation: 'explain_relation', from: 'capabilities/cart', to: 'capabilities/cart' },
  { operation: 'explain_relation', from: 'capabilities/cart', to: 'domains/order', maxHops: 1 },
  { operation: 'explain_relation', from: 'capabilities/cart', to: 'capabilities/order-lookup', direction: 'outgoing', limit: 1 },
  { operation: 'explain_relation', from: 'capabilities/cart', to: 'capabilities/order-lookup', types: ['depends_on'], maxHops: 2 },
  { operation: 'explain_relation', from: 'capabilities/cart' },
  { operation: 'relation_check', from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on' },
  { operation: 'relation_check', from: 'capabilities/cart', to: 'capabilities/checkout', type: 'depends_on' },
  { operation: 'relation_check', from: 'capabilities/cart', to: 'capabilities/order-lookup', type: 'relates' },
  { operation: 'relation_check', from: 'capabilities/cart', to: 'capabilities/order-lookup', type: 'contains' },
  { operation: 'relation_check', from: 'domains/order', to: 'capabilities/cart', type: 'capabilities' },
  { operation: 'relation_check', from: 'capabilities/cart', to: 'capabilities/order-lookup', type: 'bogus' },
  { operation: 'relation_check', from: 'capabilities/cart', to: 'capabilities/order-lookup' },
  { operation: 'lineage', slug: 'capabilities/cart' },
  { operation: 'lineage', slug: 'domains/order', limit: 2 },
  { operation: 'lineage', slug: 'storefront', depth: 1 },
  { operation: 'lineage', slug: 'elements/cart-session', depth: 0 },
  { operation: 'containment_tree' },
  { operation: 'containment_tree', slug: 'domains/order' },
  { operation: 'containment_tree', depth: 1 },
  { operation: 'containment_tree', limit: 5 },
  { operation: 'containment_tree', includeOrphans: true, limit: 500 },
  { operation: 'containment_tree', slug: 'capabilities/cart', depth: 0 },
  { operation: 'project_scope' },
  { operation: 'project_scope', project: 'storefront', limit: 3 },
  { operation: 'project_scope', slug: 'storefront', project: 'nope' },
  { operation: 'project_scope', project: 'domains/order' },
  { operation: 'project_scope', project: 'nope' },
  { operation: 'project_map' },
  { operation: 'project_map', itemLimit: 1 },
  { operation: 'project_map', project: 'storefront', limit: 1, itemLimit: 2 },
  { operation: 'project_map', itemLimit: 500 },
  { operation: 'project_map', project: 'domains/order' },
]);
walksCase('tangle', 'tangle', [
  { operation: 'reachability', slug: 'capabilities/a' },
  { operation: 'reachability', slug: 'capabilities/a', direction: 'both', depth: 20 },
  { operation: 'reachability', slug: 'capabilities/g', direction: 'incoming', depth: 4, limit: 2 },
  { operation: 'reachability', slug: 'capabilities/k', direction: 'both' },
  { operation: 'pattern_walk', slug: 'capabilities/a', pattern: ['depends_on', 'depends_on', 'depends_on', 'depends_on'] },
  { operation: 'pattern_walk', slug: 'capabilities/a', pattern: ['depends_on', 'depends_on', 'depends_on'], limit: 2 },
  { operation: 'pattern_walk', slug: 'capabilities/h', pattern: ['depends_on', 'depends_on', 'depends_on'], direction: 'incoming' },
  { operation: 'impact', slug: 'capabilities/a' },
  { operation: 'impact', slug: 'capabilities/e', direction: 'outgoing', depth: 20 },
  { operation: 'impact', slug: 'capabilities/b', direction: 'both', depth: 2, limit: 3 },
  { operation: 'blast_radius', slug: 'capabilities/a', depth: 20 },
  { operation: 'blast_radius', slug: 'capabilities/e', direction: 'outgoing', depth: 3, limit: 2 },
  { operation: 'subgraph', slug: 'capabilities/a', depth: 3 },
  { operation: 'subgraph', slug: 'capabilities/a', direction: 'incoming', depth: 20, limit: 4 },
  { operation: 'explain_relation', from: 'capabilities/a', to: 'capabilities/g' },
  { operation: 'explain_relation', from: 'capabilities/c', to: 'capabilities/d' },
  { operation: 'explain_relation', from: 'capabilities/a', to: 'capabilities/h' },
  { operation: 'explain_relation', from: 'capabilities/b', to: 'capabilities/e', limit: 1 },
  { operation: 'relation_check', from: 'capabilities/a', to: 'capabilities/b', type: 'depends_on' },
  { operation: 'relation_check', from: 'capabilities/b', to: 'capabilities/a', type: 'depends_on' },
  { operation: 'relation_check', from: 'capabilities/a', to: 'capabilities/g', type: 'depends_on' },
  { operation: 'relation_check', from: 'capabilities/a', to: 'capabilities/g', type: 'describes' },
  { operation: 'lineage', slug: 'capabilities/a' },
  { operation: 'containment_tree' },
  { operation: 'containment_tree', includeOrphans: true },
  { operation: 'project_scope' },
  { operation: 'project_map', itemLimit: 3 },
]);
walksCase('containment-tangle', 'containment-tangle', [
  { operation: 'containment_tree' },
  { operation: 'containment_tree', includeOrphans: true },
  { operation: 'containment_tree', includeOrphans: true, limit: 6 },
  { operation: 'containment_tree', slug: 'capabilities/loop-a' },
  { operation: 'containment_tree', slug: 'capabilities/self' },
  { operation: 'containment_tree', slug: 'walks', depth: 1 },
  { operation: 'containment_tree', slug: 'walks', limit: 3 },
  { operation: 'lineage', slug: 'capabilities/load' },
  { operation: 'lineage', slug: 'elements/shared' },
  { operation: 'lineage', slug: 'capabilities/loop-a' },
  { operation: 'lineage', slug: 'capabilities/self' },
  { operation: 'lineage', slug: 'capabilities/orphan-child' },
  { operation: 'project_scope' },
  { operation: 'project_scope', project: 'walks' },
  { operation: 'project_scope', project: 'second', limit: 1 },
  { operation: 'project_map' },
  { operation: 'project_map', project: 'walks', itemLimit: 2 },
  { operation: 'project_map', project: 'walks', limit: 1 },
  { operation: 'impact', slug: 'capabilities/save' },
  { operation: 'impact', slug: 'capabilities/save', depth: 1 },
  { operation: 'blast_radius', slug: 'capabilities/save' },
  { operation: 'blast_radius', slug: 'capabilities/load', direction: 'outgoing' },
  { operation: 'pattern_walk', slug: 'capabilities/load', pattern: ['depends_on'] },
  { operation: 'pattern_walk', slug: 'capabilities/ship', pattern: ['depends_on', 'depends_on'] },
  { operation: 'pattern_walk', slug: 'domains/core', pattern: ['capabilities', 'contains'] },
  { operation: 'subgraph', slug: 'capabilities/save', depth: 2, limit: 4 },
  { operation: 'explain_relation', from: 'capabilities/load', to: 'capabilities/ship' },
  { operation: 'explain_relation', from: 'capabilities/load', to: 'capabilities/save' },
  { operation: 'explain_relation', from: 'capabilities/Zeta', to: 'capabilities/alpha-gamma' },
  { operation: 'explain_relation', from: 'capabilities/orphan', to: 'capabilities/load' },
  { operation: 'relation_check', from: 'capabilities/load', to: 'capabilities/save', type: 'depends_on' },
  { operation: 'relation_check', from: 'capabilities/orphan', to: 'capabilities/load', type: 'relates' },
  { operation: 'relation_check', from: 'capabilities/ship', to: 'capabilities/load', type: 'depends_on' },
  { operation: 'relation_check', from: 'documents/guide', to: 'capabilities/save', type: 'describes' },
]);
walksCase('edge-names', 'edge-names', [
  { operation: 'reachability', slug: 'domains/\uacb0\uc81c', direction: 'both' },
  { operation: 'pattern_walk', slug: 'domains/\uacb0\uc81c', pattern: ['capabilities', 'dependencies'] },
  { operation: 'impact', slug: 'capabilities/cancel-order' },
  { operation: 'blast_radius', slug: 'capabilities/cancel-order' },
  { operation: 'subgraph', slug: 'domains/\uacb0\uc81c', depth: 2 },
  { operation: 'explain_relation', from: 'capabilities/\uc8fc\ubb38-\ucde8\uc18c', to: 'capabilities/cancel-order' },
  { operation: 'lineage', slug: 'capabilities/\uc8fc\ubb38-\ucde8\uc18c' },
  { operation: 'containment_tree' },
  { operation: 'containment_tree', includeOrphans: true },
  { operation: 'project_scope' },
  { operation: 'project_map' },
  { operation: 'path', from: 'capabilities/start', to: 'capabilities/target' },
  { operation: 'explain_relation', from: 'capabilities/start', to: 'capabilities/target' },
  { operation: 'reachability', slug: 'capabilities/start' },
]);
walksCase('miniature-repo', 'miniature-repo', [
  { operation: 'impact', slug: 'capabilities/charge-card' },
  { operation: 'blast_radius', slug: 'capabilities/charge-card', depth: 3 },
  { operation: 'reachability', slug: 'capabilities/place-order', direction: 'both' },
  { operation: 'project_scope' },
  { operation: 'project_map' },
  { operation: 'containment_tree' },
  { operation: 'relation_check', from: 'capabilities/place-order', to: 'capabilities/cancel-order', type: 'relates' },
]);
walksCase('atlas-ontology', 'atlas-ontology', [
  { operation: 'impact', slug: 'capabilities/vault-graph-query' },
  { operation: 'impact', slug: 'capabilities/vault-graph-query', direction: 'outgoing', depth: 3 },
  { operation: 'blast_radius', slug: 'capabilities/vault-graph-query', direction: 'outgoing', depth: 2 },
  { operation: 'blast_radius', slug: 'elements/graph-engine', depth: 3, limit: 5 },
  { operation: 'reachability', slug: 'domains/meaning-layer', depth: 2 },
  { operation: 'reachability', slug: 'elements/graph-engine', direction: 'both', depth: 3, limit: 7 },
  { operation: 'subgraph', slug: 'domains/meaning-layer', depth: 1, limit: 500 },
  { operation: 'subgraph', slug: 'capabilities/vault-graph-query', depth: 2 },
  { operation: 'pattern_walk', slug: 'domains/meaning-layer', pattern: ['capabilities', 'dependencies'] },
  { operation: 'pattern_walk', slug: 'domains/meaning-layer', pattern: ['capabilities', 'elements'], limit: 5 },
  { operation: 'explain_relation', from: 'capabilities/vault-graph-query', to: 'elements/graph-engine' },
  { operation: 'explain_relation', from: 'capabilities/vault-graph-query', to: 'capabilities/vault-validation' },
  { operation: 'relation_check', from: 'capabilities/vault-graph-query', to: 'elements/graph-engine', type: 'depends_on' },
  { operation: 'relation_check', from: 'capabilities/vault-graph-query', to: 'capabilities/vault-validation', type: 'depends_on' },
  { operation: 'lineage', slug: 'elements/graph-engine' },
  { operation: 'lineage', slug: 'ontology-atlas', limit: 10 },
  { operation: 'containment_tree' },
  { operation: 'containment_tree', slug: 'domains/meaning-layer', depth: 2 },
  { operation: 'project_scope' },
  { operation: 'project_scope', limit: 500 },
  { operation: 'project_map' },
  { operation: 'project_map', itemLimit: 3 },
]);
walksCase('empty', 'empty', [
  { operation: 'project_scope' },
  { operation: 'project_map' },
  { operation: 'containment_tree' },
  { operation: 'reachability', slug: 'capabilities/a' },
  { operation: 'relation_check', from: 'a', to: 'b', type: 'depends_on' },
  { operation: 'subgraph', slug: 'x' },
]);

// The selection operations: match_nodes, match_edges, node_profile, domain_profile, domain_matrix,
// similar_nodes, recommend_relations, growth_plan, maintenance_plan, health and workspace_brief.
const query = (args) => call('query_ontology', args);
const SELECTION_RICH = [
  { operation: 'match_nodes' }, { operation: 'match_nodes', kind: 'capability', sort: 'degree' },
  { operation: 'match_nodes', kind: 'capability', sort: 'inDegree', limit: 2 }, { operation: 'match_nodes', sort: 'outDegree', hasOutgoing: true },
  { operation: 'match_nodes', sort: 'slug', kind: 'element' }, { operation: 'match_nodes', domain: 'domains/billing' },
  { operation: 'match_nodes', domain: 'billing', kind: 'element' }, { operation: 'match_nodes', hasIncoming: true, hasOutgoing: false },
  { operation: 'match_nodes', hasIncoming: false, hasOutgoing: false }, { operation: 'match_nodes', hasIncoming: true, excludeKinds: [] },
  { operation: 'match_nodes', hasIncoming: false, excludeKinds: ['project'], limit: 1, offset: 1 }, { operation: 'match_nodes', domain: 'domains/nowhere' },
  { operation: 'match_nodes', kind: 'domain', limit: 1 }, { operation: 'match_nodes', kind: 'bogus' }, { operation: 'match_nodes', sort: 'bogus' },
  { operation: 'domain_matrix' }, { operation: 'domain_matrix', limit: 1 }, { operation: 'domain_matrix', types: ['depends_on'] },
  { operation: 'domain_matrix', project: 'alpha' }, { operation: 'domain_matrix', project: 'nowhere' }, { operation: 'domain_matrix', types: ['bogus'] },
  { operation: 'node_profile', slug: 'capabilities/invoice' }, { operation: 'node_profile', slug: 'capabilities/ship', limit: 1 },
  { operation: 'node_profile', slug: 'domains/billing' }, { operation: 'node_profile', slug: 'alpha' }, { operation: 'node_profile', slug: 'loose-capability' },
  { operation: 'node_profile', slug: 'capabilities/orphan-cap' }, { operation: 'node_profile', slug: 'capabilities/invoic' }, { operation: 'node_profile' },
  { operation: 'similar_nodes', slug: 'capabilities/invoice-export' }, { operation: 'similar_nodes', slug: 'capabilities/invoice', limit: 2 },
  { operation: 'similar_nodes', slug: 'capabilities/invoice', kind: 'capability' }, { operation: 'similar_nodes', title: 'Invoice Exports' },
  { operation: 'similar_nodes', slug: 'capabilities/nothing-like-it' }, { operation: 'similar_nodes' },
  { operation: 'recommend_relations', slug: 'capabilities/orphan-cap' }, { operation: 'recommend_relations', slug: 'capabilities/invoice-import' },
  { operation: 'recommend_relations', kind: 'capability' }, { operation: 'recommend_relations', kind: 'element', limit: 1 }, { operation: 'recommend_relations', kind: 'domain' },
  { operation: 'recommend_relations', slug: 'domains/billing' }, { operation: 'recommend_relations', candidateSlug: 'capabilities/pay' },
  { operation: 'health' }, { operation: 'health', limit: 1 }, { operation: 'health', limit: 2 },
  { operation: 'health', types: ['depends_on'] }, { operation: 'health', types: ['relates'], limit: 1 }, { operation: 'health', types: ['depends_on', 'relates'] },
  { operation: 'health', maxHops: 2 }, { operation: 'health', types: ['bogus'] },
  { operation: 'growth_plan' }, { operation: 'growth_plan', limit: 1 }, { operation: 'growth_plan', includeExternal: false }, { operation: 'growth_plan', includeUnresolved: false },
  { operation: 'growth_plan', limit: 2 }, { operation: 'growth_plan', itemLimit: 1 },
  { operation: 'maintenance_plan' }, { operation: 'maintenance_plan', limit: 2 }, { operation: 'maintenance_plan', phases: ['repair'] },
  { operation: 'maintenance_plan', severities: ['warn', 'fail'] }, { operation: 'maintenance_plan', kinds: ['repair_dangling_reference'] },
  { operation: 'maintenance_plan', executableOnly: true }, { operation: 'maintenance_plan', project: 'alpha' }, { operation: 'maintenance_plan', project: 'nowhere' },
  { operation: 'maintenance_plan', phases: ['bogus'] }, { operation: 'maintenance_plan', afterActionId: 'maint_00000000' }, { operation: 'maintenance_plan', limit: 1, itemLimit: 1 },
  { operation: 'workspace_brief' }, { operation: 'workspace_brief', limit: 1 }, { operation: 'workspace_brief', limit: 3, includeExternal: false },
];
add('graph', 'graph-selection-rich', { vault: 'selection-rich' }, SELECTION_RICH.map(query));
// A list inside an answer is cut at `limit`: the domains of a matrix, and the neighbours a similar
// node shares with the source.
add('graph', 'graph-selection-limited-lists', { vault: 'selection-rich' }, [
  { operation: 'similar_nodes', slug: 'capabilities/invoice', limit: 1 },
  { operation: 'similar_nodes', slug: 'capabilities/pay', limit: 1 }, { operation: 'similar_nodes', slug: 'capabilities/invoice', limit: 100 },
].map(query));
add('graph', 'graph-selection-storefront', { vault: 'storefront' }, [
  { operation: 'match_nodes', kind: 'capability', sort: 'degree', limit: 15 }, { operation: 'match_nodes', domain: 'domains/order', sort: 'inDegree' },
  { operation: 'node_profile', slug: 'capabilities/checkout' }, { operation: 'node_profile', slug: 'domains/order' }, { operation: 'node_profile', slug: 'storefront' },
  { operation: 'similar_nodes', slug: 'capabilities/coupon-redeem' }, { operation: 'similar_nodes', slug: 'capabilities/order-cancel', limit: 3 },
  { operation: 'recommend_relations', slug: 'capabilities/cart' }, { operation: 'recommend_relations', kind: 'capability', limit: 10 }, { operation: 'recommend_relations', kind: 'element' },
  { operation: 'health' }, { operation: 'health', limit: 3 }, { operation: 'growth_plan' }, { operation: 'growth_plan', limit: 3 },
  { operation: 'maintenance_plan' }, { operation: 'maintenance_plan', limit: 5 }, { operation: 'maintenance_plan', phases: ['link', 'materialize'] }, { operation: 'maintenance_plan', project: 'storefront' },
  { operation: 'workspace_brief' }, { operation: 'workspace_brief', limit: 4 },
].map(query));
add('graph', 'graph-selection-atlas-ontology', { vault: 'atlas-ontology' }, [
  { operation: 'match_nodes', kind: 'capability', sort: 'degree', limit: 20 }, { operation: 'match_nodes', kind: 'element', hasIncoming: false, limit: 50 },
  { operation: 'recommend_relations', kind: 'capability', limit: 20 },
  { operation: 'health' }, { operation: 'health', limit: 25 }, { operation: 'growth_plan' }, { operation: 'growth_plan', limit: 25 },
  { operation: 'maintenance_plan' }, { operation: 'maintenance_plan', limit: 50 }, { operation: 'workspace_brief' }, { operation: 'workspace_brief', limit: 25 },
].map(query));
add('graph', 'graph-selection-miniature-repo', { vault: 'miniature-repo' }, [
  { operation: 'match_nodes' }, { operation: 'recommend_relations', kind: 'capability' },
  { operation: 'health' }, { operation: 'growth_plan' }, { operation: 'maintenance_plan' }, { operation: 'workspace_brief' },
  { operation: 'node_profile', slug: 'capabilities/charge-card' }, { operation: 'similar_nodes', slug: 'capabilities/charge-card' },
].map(query));
add('graph', 'graph-selection-tangle', { vault: 'tangle' }, [
  { operation: 'match_nodes', sort: 'degree' },
  { operation: 'health' }, { operation: 'health', limit: 1 }, { operation: 'health', limit: 2 }, { operation: 'health', maxHops: 3 },
  { operation: 'growth_plan' }, { operation: 'maintenance_plan' }, { operation: 'maintenance_plan', limit: 1 }, { operation: 'workspace_brief' }, { operation: 'workspace_brief', limit: 2 },
  { operation: 'recommend_relations', kind: 'capability' }, { operation: 'similar_nodes', slug: 'capabilities/a' },
].map(query));
add('graph', 'graph-selection-edge-names', { vault: 'edge-names' }, [
  { operation: 'match_nodes', sort: 'slug' }, { operation: 'node_profile', slug: 'capabilities/\uac00\ub098\ub2e4' },
  { operation: 'health' }, { operation: 'growth_plan' }, { operation: 'maintenance_plan' }, { operation: 'workspace_brief' },
  { operation: 'recommend_relations', kind: 'capability' }, { operation: 'similar_nodes', slug: 'capabilities/\uc8fc\ubb38-\ucde8\uc18c' },
].map(query));
add('graph', 'graph-selection-ambiguous-and-dangling', { vault: 'ambiguous-dangling' }, [
  { operation: 'match_nodes' }, { operation: 'node_profile', slug: 'capabilities/a' },
  { operation: 'health' }, { operation: 'growth_plan' }, { operation: 'maintenance_plan' }, { operation: 'workspace_brief' }, { operation: 'recommend_relations', slug: 'capabilities/c' },
].map(query));
add('graph', 'graph-selection-empty', { vault: 'empty' }, [
  { operation: 'match_nodes' }, { operation: 'node_profile', slug: 'x' },
  { operation: 'similar_nodes', slug: 'x' }, { operation: 'recommend_relations', kind: 'capability' }, { operation: 'health' }, { operation: 'growth_plan' },
  { operation: 'maintenance_plan' }, { operation: 'workspace_brief' },
].map(query));
add('graph', 'graph-selection-one-node', { vault: 'one-node' }, [
  { operation: 'match_nodes' }, { operation: 'node_profile', slug: 'only' }, { operation: 'health' }, { operation: 'growth_plan' },
  { operation: 'maintenance_plan' }, { operation: 'workspace_brief' },
].map(query));
// A call that is wrong is refused with the sentence the JavaScript server used.
add('graph', 'graph-selection-refusals', { vault: 'storefront' }, [
  { operation: 'match_nodes', limit: 0 }, { operation: 'match_nodes', limit: 501 }, { operation: 'match_nodes', limit: 1.5 }, { operation: 'match_nodes', offset: -1 },
  { operation: 'match_nodes', offset: 'x' }, { operation: 'match_nodes', hasIncoming: 'yes' }, { operation: 'match_nodes', kind: '' }, { operation: 'match_nodes', domain: 5 },
  { operation: 'node_profile', slug: ['a'] },
  { operation: 'health', limit: 0 }, { operation: 'health', limit: 501 }, { operation: 'health', limit: 'x' }, { operation: 'growth_plan', limit: 0 },
  { operation: 'maintenance_plan', phases: 'repair' }, { operation: 'maintenance_plan', phases: ['a', 'b', 'c', 'd', 'e', 'f'] }, { operation: 'maintenance_plan', severities: [] },
  { operation: 'maintenance_plan', kinds: [1] }, { operation: 'maintenance_plan', executableOnly: 'true' }, { operation: 'maintenance_plan', project: 'no-such-project' },
  { operation: 'maintenance_plan', project: 'domains/order' }, { operation: 'workspace_brief', limit: 'many' }, { operation: 'recommend_relations', kind: 'project' },
  { operation: 'recommend_relations', slug: 'capabilities/nope' }, { operation: 'similar_nodes', slug: 'capabilities/nope' },
].map(query));
add('graph', 'graph-selection-chain', { vault: 'selection-chain' }, [
  { operation: 'match_nodes', sort: 'degree', limit: 5 }, { operation: 'node_profile', slug: 'capabilities/link-5000', limit: 5 },
  { operation: 'similar_nodes', slug: 'capabilities/link-77', limit: 5 },
  { operation: 'recommend_relations', slug: 'capabilities/link-9999' }, { operation: 'health', limit: 5 }, { operation: 'growth_plan', limit: 5 },
  { operation: 'maintenance_plan', limit: 5 }, { operation: 'workspace_brief', limit: 5 },
].map(query));
add('graph', 'graph-selection-hub', { vault: 'selection-hub' }, [
  { operation: 'match_nodes', sort: 'inDegree', limit: 5 }, { operation: 'node_profile', slug: 'capabilities/hub-core', limit: 5 },
  { operation: 'similar_nodes', slug: 'capabilities/spoke-1', limit: 5 },
  { operation: 'recommend_relations', slug: 'capabilities/hub-core' }, { operation: 'health', limit: 5 }, { operation: 'growth_plan', limit: 5 },
  { operation: 'maintenance_plan', limit: 5 }, { operation: 'workspace_brief', limit: 5 },
].map(query));

// The analysis records the app writes under `.ontology-atlas/analyses`, planted as the app's own
// writer made them (the fixtures of the archive's tests in the Rust program), and the damaged and
// linked files a vault from Git or a sync client can hold. `analysis_history` and `analysis_record`
// answer from those files and never compile the graph.
const ARCHIVE_FIXTURES = new URL('../../../src-tauri/crates/mcp-server/src/analysis_records/fixtures/', import.meta.url);
const fixture = (name) => readFileSync(new URL(name, ARCHIVE_FIXTURES), 'utf8');
const RUN_ID = '3f2b7c1e-9d4a-4e8b-a1c6-5d0e7f8a9b10';
const REVIEW_ID = '8a6e1d2c-7b3f-4c9a-b5d4-1e2f3a4b5c6d';
const RUN_FILE = `2026-11-27T09-15-30-123Z-${RUN_ID}.md`;
const REVIEW_FILE = `2026-11-27T10-00-00-000Z-${REVIEW_ID}.md`;
const archived = (name, text) => ({ $: 'write-file', path: `.ontology-atlas/analyses/${name}`, text });
const archiveCall = (args) => call('query_ontology', args);
const APP_RECORDS = [archived(RUN_FILE, fixture('run-written-by-the-app.txt')), archived(REVIEW_FILE, fixture('review-written-by-the-app.txt'))];
add('graph', 'analysis-records-written-by-the-app', { vault: 'storefront' }, [
  ...APP_RECORDS,
  archiveCall({ operation: 'analysis_record', recordId: RUN_ID }),
  archiveCall({ operation: 'analysis_record', recordId: REVIEW_ID }),
  archiveCall({ operation: 'analysis_record', recordId: '11111111-1111-4111-8111-111111111111' }),
  archiveCall({ operation: 'analysis_record', recordId: RUN_ID.toUpperCase() }),
  archiveCall({ operation: 'analysis_record' }),
]);
add('graph', 'analysis-records-damaged', { vault: 'storefront' }, [
  ...APP_RECORDS,
  archived('2026-11-26T09-00-00-000Z-11111111-2222-4333-8444-555555555555.md', fixture('run-written-by-the-app.txt').slice(0, 500)),
  archived('2026-11-25T09-00-00-000Z-11111111-2222-4333-8444-666666666666.md', fixture('run-written-by-the-app.txt').replace('A cart.', 'A cart!')),
  archived('2026-11-24T09-00-00-000Z-11111111-2222-4333-8444-777777777777.md', '---\nanalysis_schema: "atlas-analysis/v1"\n---\nno more\n'),
  archived('2026-11-23T09-00-00-000Z-11111111-2222-4333-8444-888888888888.md', ''),
  archived('notes.txt', 'not a record'),
  archived('2026-11-22T09-00-00-000Z-not-an-id.md', 'x'),
  archiveCall({ operation: 'analysis_record', recordId: '11111111-2222-4333-8444-555555555555' }),
  archiveCall({ operation: 'analysis_record', recordId: '11111111-2222-4333-8444-666666666666' }),
  archived(`2026-11-29T09-15-30-123Z-${RUN_ID}.md`, fixture('run-written-by-the-app.txt')),
  archiveCall({ operation: 'analysis_record', recordId: RUN_ID }),
]);
add('graph', 'analysis-records-with-line-separators', { vault: 'empty' }, [
  archived(RUN_FILE, fixture('run-with-line-separators.txt')),
  archiveCall({ operation: 'analysis_record', recordId: RUN_ID }),
]);
add('graph', 'analysis-folder-is-a-link', { vault: 'empty' }, [
  { $: 'mkdir', path: '.ontology-atlas' },
  { $: 'symlink', path: '.ontology-atlas/analyses', target: '..' },
  archiveCall({ operation: 'analysis_record', recordId: RUN_ID }),
]);
add('graph', 'analysis-record-is-a-link', { vault: 'empty' }, [
  archived('plain.txt', fixture('run-written-by-the-app.txt')),
  { $: 'symlink', path: `.ontology-atlas/analyses/${RUN_FILE}`, target: 'plain.txt' },
  archiveCall({ operation: 'analysis_record', recordId: RUN_ID }),
]);
// Names the server stopped offering. Each is refused as `invalid_arguments` with the call that
// answers the same question, so an agent whose notes predate the cut learns the current call.
add('graph', 'retired-query-operations', { vault: 'storefront' }, [
  ...['all_paths', 'centrality', 'builder_context', 'match_edges', 'domain_profile',
    'topological_order', 'meaning_repair_review', 'analysis_history'].map((operation) => query({ operation })),
  query({ operation: 'agent_brief', project: 'storefront', detail: 'compact', task: 'change how a card is charged' }),
  query({ operation: 'agent_brief', project: 'storefront', task: 'change how a card is charged' }),
  call('connection_info', { guide: 'competency' }),
]);

// `query_plan`: what each family of operations would cost, on graphs that are plain, empty and
// full of cycles, with the arguments left out, sent, and wrong.
const planCase = (name, vault, queries) => add('graph', `query-plan-${name}`, { vault }, queries.map((args) => call('query_ontology', { operation: 'query_plan', ...args })));
planCase('storefront', 'storefront', [
  { targetOperation: 'neighbors', slug: 'capabilities/checkout' },
  { targetOperation: 'neighbors', slug: 'capabilities/checkout', direction: 'in', types: ['depends_on'], limit: 3 },
  { targetOperation: 'neighbors', slug: 'capabilities/checkout', includeExternal: true, includeUnresolved: true },
  { targetOperation: 'neighbors', slug: 'capabilities/checkout', direction: 'undirected' },
  { targetOperation: 'neighbors', slug: 'capabilities/does-not-exist' },
  { targetOperation: 'neighbors' },
  { targetOperation: 'path', from: 'capabilities/cart', to: 'capabilities/order-cancel' },
  { targetOperation: 'path', from: 'capabilities/cart', to: 'capabilities/order-cancel', maxHops: 2, types: ['depends_on', 'relates'], direction: 'both' },
  { targetOperation: 'explain_relation', from: 'capabilities/cart', to: 'capabilities/checkout' },
  { targetOperation: 'explain_relation', from: 'capabilities/cart', to: 'capabilities/checkout', limit: 2, maxHops: 1 },
  { targetOperation: 'reachability', slug: 'capabilities/checkout' },
  { targetOperation: 'reachability', from: 'capabilities/checkout' },
  { targetOperation: 'reachability', slug: 'capabilities/checkout', direction: 'both', depth: 4, limit: 7, types: ['depends_on'] },
  { targetOperation: 'impact', slug: 'capabilities/order-placement' },
  { targetOperation: 'impact', slug: 'capabilities/order-placement', types: ['contains'] },
  { targetOperation: 'blast_radius', slug: 'capabilities/order-placement', depth: 2 },
  { targetOperation: 'subgraph', slug: 'domains/order' },
  { targetOperation: 'subgraph', slug: 'capabilities/cart', direction: 'incoming', depth: 3, limit: 5 },
  { targetOperation: 'match_nodes' },
  { targetOperation: 'match_nodes', kind: 'capability', domain: 'domains/order', hasIncoming: false, sort: 'degree', limit: 5 },
  { targetOperation: 'match_nodes', kind: 'nonsense' },
  { targetOperation: 'overview' },
  { targetOperation: 'node_profile', slug: 'capabilities/cart' },
  { targetOperation: 'project_scope', project: 'storefront' },
  { targetOperation: 'lineage', slug: 'capabilities/cart', depth: 2 },
  { targetOperation: 'pattern_walk', slug: 'capabilities/checkout', pattern: ['depends_on', 'depends_on'] },
  { targetOperation: 'query_plan' },
  { targetOperation: 'bogus' },
  {},
]);
// Cycle-heavy graphs: a plan counts them level by level, and warns before an enumeration that
// would not finish.
planCase('tangle', 'tangle', [
  { targetOperation: 'overview' },
  { targetOperation: 'path', from: 'capabilities/a', to: 'capabilities/g', maxHops: 20, direction: 'both' },
  { targetOperation: 'reachability', slug: 'capabilities/b', direction: 'both', depth: 20 },
  { targetOperation: 'impact', slug: 'capabilities/b', depth: 20 },
  { targetOperation: 'subgraph', slug: 'capabilities/b', depth: 20 },
  { targetOperation: 'neighbors', slug: 'capabilities/b', direction: 'both' },
]);
planCase('containment-tangle', 'containment-tangle', [
  { targetOperation: 'overview' },
  { targetOperation: 'match_nodes' },
]);
planCase('empty', 'empty', [
  { targetOperation: 'overview' },
  { targetOperation: 'match_nodes' },
  { targetOperation: 'neighbors', slug: 'capabilities/a' },
]);
planCase('one-node', 'one-node', [
  { targetOperation: 'subgraph', slug: 'capabilities/a' },
]);

// ---------------------------------------------------------------------------------------------
// git: reads and staleness
// ---------------------------------------------------------------------------------------------

add('git', 'staleness-through-validate-vault', { vault: 'miniature-repo' }, [
  call('validate_vault', {}),
  call('validate_vault', { repoRoot: '$PARENT' }),
  call('validate_vault', { repoRoot: '$PARENT/does-not-exist' }),
  call('query_ontology', { operation: 'health' }),
  call('query_ontology', { operation: 'maintenance_plan' }),
  call('get_concepts', { slugs: ['capabilities/place-order', 'capabilities/cancel-order'] }),
]);
add('git', 'no-git-executable', { vault: 'miniature-repo', env: { PATH: '/usr/bin/does-not-exist' } }, [
  call('connection_info', {}),
  call('validate_vault', {}),
]);

// ---------------------------------------------------------------------------------------------
// imports: infer_imports and inspect_architecture
// ---------------------------------------------------------------------------------------------

// Folders a virtual environment, an editor or a test runner keeps: one list of ignored names for
// every scan of a repository (row 48), so their files are no module of the product.
add('imports', 'infer-imports-ignored-environments', { vault: 'miniature-repo' }, [
  { $: 'write-file', path: '../src/app.py', text: 'import helper\nfrom pkg import thing\n' },
  { $: 'write-file', path: '../src/helper.py', text: 'VALUE = 1\n' },
  { $: 'write-file', path: '../src/venv/site.py', text: 'import os\n' },
  { $: 'write-file', path: '../src/.venv/site.py', text: 'import os\n' },
  { $: 'write-file', path: '../src/__pycache__/cached.py', text: 'import os\n' },
  { $: 'write-file', path: '../src/.pytest_cache/plugin.py', text: 'import os\n' },
  { $: 'write-file', path: '../src/.idea/tool.js', text: "import x from './y';\n" },
  { $: 'write-file', path: '../src/.vscode/tool.js', text: "import x from './y';\n" },
  call('infer_imports', { rootPath: '$PARENT' }),
]);
add('imports', 'infer-imports-miniature-repo', { vault: 'miniature-repo' }, [
  call('infer_imports', {}),
  call('infer_imports', { rootPath: '$PARENT' }),
  call('infer_imports', { rootPath: '$PARENT', sourceFolders: ['src'] }),
  call('infer_imports', { rootPath: '$PARENT', sourceFolders: ['src/order', 'src/payment'], ignore: ['**/cancel.ts'] }),
  call('infer_imports', { rootPath: '$PARENT', maxFiles: 3 }),
  call('infer_imports', { rootPath: '$PARENT', reconcile: true }),
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'summary' }),
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'full', allowLargeResponse: true }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/payment/charge.ts', focusDirection: 'in', focusLimit: 5 }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/order/placement.ts', focusDirection: 'out' }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/nope.ts' }),
  call('infer_imports', { rootPath: '$PARENT', afterReviewId: 'x' }),
  call('infer_imports', { rootPath: '$PARENT/src' }),
  call('infer_imports', { rootPath: '$PARENT/does-not-exist' }),
  call('infer_imports', { rootPath: '$PARENT', maxFiles: 0 }),
]);
add('imports', 'infer-imports-other-vaults', { vault: 'storefront' }, [
  call('infer_imports', {}),
  call('infer_imports', { rootPath: '$VAULT' }),
  call('infer_imports', { rootPath: '$VAULT', reconcile: true }),
]);
add('imports', 'infer-imports-hangul-and-edge-folders', { vault: 'edge-names' }, [call('infer_imports', {}), call('infer_imports', { rootPath: '$VAULT' })]);
add('imports', 'inspect-architecture-miniature-repo', { vault: 'miniature-repo' }, [
  call('inspect_architecture', {}),
  call('inspect_architecture', { rootPath: '$PARENT' }),
  call('inspect_architecture', { rootPath: '$PARENT', maxFiles: 2 }),
  call('inspect_architecture', { rootPath: '$PARENT', profileSlug: 'nope' }),
  call('inspect_architecture', { rootPath: '$PARENT/does-not-exist' }),
  call('inspect_architecture', { rootPath: '$PARENT', maxFiles: 0 }),
]);
add('imports', 'inspect-architecture-storefront-profile', { vault: 'storefront' }, [
  call('inspect_architecture', { profileSlug: 'architecture/storefront-services' }),
  call('inspect_architecture', { rootPath: '$VAULT', profileSlug: 'architecture/storefront-services' }),
]);
// A brief for a folder that is not under git: it is the one answer in which the Node server adds a
// `measured` stamp the Rust server does not yet (row 35), so each request stands alone and the
// other answers of the tool are compared whole in the cases above.
add('imports', 'inspect-architecture-folder-without-git', { vault: 'storefront' }, [
  call('inspect_architecture', {}),
]);
add('imports', 'inspect-architecture-profile-by-slug-without-git', { vault: 'storefront' }, [
  call('inspect_architecture', { profileSlug: 'storefront-services' }),
]);
// Where the syntax tree reads what the line scanners did not (rows 2, 33 and 34 of the table, and a hidden folder an import may name).
const plant = (path, text) => ({ $: 'write-file', path: `../parser/${path}`, text });
add('imports', 'infer-imports-syntax-tree-reads', { vault: 'miniature-repo' }, [
  plant('binary/a.ts', '\u0000\u0001\u0002 import { b } from \'./b\';\n'),
  plant('binary/b.ts', 'export const b = 1;\n'),
  call('infer_imports', { rootPath: '$PARENT/parser/binary', reconcile: false }),
  plant('rust/lib.rs', '#![allow(dead_code)]\nmod util;\n#[cfg(unix)]\nuse crate::util::tool;\nuse crate::\n    util::other;\nmacro_rules! m { () => { use crate::ghost::x; } }\n'),
  plant('rust/util.rs', 'pub fn tool() {}\npub fn other() {}\n'),
  call('infer_imports', { rootPath: '$PARENT/parser/rust', reconcile: false }),
  plant('jvm/src/main/java/com/acme/Café.java', 'package com.acme;\nclass Café { Naïve n; }\n'),
  plant('jvm/src/main/java/com/acme/Naïve.java', 'package com.acme;\nclass Naïve {}\n'),
  plant('jvm/src/main/kotlin/com/acme/Use.kt', 'package com.acme\nfun use() = "${Naïve()}"\n'),
  call('infer_imports', { rootPath: '$PARENT/parser/jvm', reconcile: false }),
  plant('script/a.ts', '// import \'in-comment\';\nconst note = "import \'in-string\'";\nimport type { T } from \'./b\';\nexport type U = import(\'./b\').T;\nconst later = await import(\'./b\');\n'),
  plant('script/b.ts', 'export type T = 1;\n'),
  call('infer_imports', { rootPath: '$PARENT/parser/script', reconcile: false }),
  plant('hidden/a.ts', 'import data from \'./.hidden/data.json\';\n'),
  plant('hidden/.hidden/data.json', '{}\n'),
  call('infer_imports', { rootPath: '$PARENT/parser/hidden', reconcile: false }),
]);
// A source file named like a credential is never opened (row 36); the answer says how many it did not read.
add('imports', 'infer-imports-credential-named-source-files', { vault: 'miniature-repo' }, [
  plant('credentials/src/a.ts', 'export const a = 1;\n'),
  plant('credentials/src/ok.ts', "import { a } from './a';\n"),
  plant('credentials/src/secrets.ts', "import { a } from './a';\n"),
  plant('credentials/src/credentials.py', 'import os\n'),
  plant('credentials/src/keys/server.pem', '-----BEGIN-----\n'),
  call('infer_imports', { rootPath: '$PARENT/parser/credentials', reconcile: false }),
]);
// The per-file limit of 256 Rust statements and 256 Go imports, and a tree 130 folders deep.
const limitLines = (count, line) => Array.from({ length: count }, (_, index) => line(index)).join('\n');
add('imports', 'infer-imports-per-file-limits-and-depth', { vault: 'miniature-repo' }, [
  plant('limits/rust/lib.rs', `${limitLines(300, (index) => `use crate_${index}::item;`)}\n`),
  call('infer_imports', { rootPath: '$PARENT/parser/limits/rust', reconcile: false }),
  plant('limits/go/go.mod', 'module example.com/app\n'),
  plant('limits/go/main.go', `package main\n\nimport (\n${limitLines(300, (index) => `\t"example.com/app/pkg${index}"`)}\n)\n`),
  call('infer_imports', { rootPath: '$PARENT/parser/limits/go', reconcile: false }),
  plant(`limits/deep/${'d/'.repeat(130)}a.ts`, "import './b';\n"),
  plant(`limits/deep/${'d/'.repeat(130)}b.ts`, 'export const b = 1;\n'),
  call('infer_imports', { rootPath: '$PARENT/parser/limits/deep', reconcile: false }),
]);
add('imports', 'infer-imports-review-and-focus-pages', { vault: 'miniature-repo' }, [
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'next' }, { as: 'review-1' }),
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'next', afterReviewId: answerOf('review-1', 'result.structuredContent.nextReview.reviewId') }),
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'next', afterReviewId: 'import-review:nope:nope' }),
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'next', reconcile: false }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/payment/charge.ts', focusLimit: 1 }, { as: 'focus-1' }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/payment/charge.ts', focusLimit: 1, focusAfterEdgeId: answerOf('focus-1', 'result.structuredContent.focusReview.cursor.nextAfterEdgeId') }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/payment/charge.ts', focusDirection: 'incoming' }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/payment/charge.ts', focusAfterEdgeId: 'import-impact:nothing' }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: '../outside.ts' }),
  call('infer_imports', { rootPath: '$PARENT', focusPath: 'src/order/placement.ts', reviewMode: 'full' }),
  call('infer_imports', { rootPath: '$PARENT', allowLargeResponse: true }),
  call('infer_imports', { rootPath: '$PARENT', focusDirection: 'both' }),
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'focus' }),
]);
// The vault is read through the kept graph: a node and a source file added between two scans are
// in the second answer, and a relation the vault never had shows as drift.
const auditNode = '---\nuid: 33333333-4444-4555-8666-777777777777\nslug: capabilities/audit-order\nkind: capability\ntitle: Audit Order\ndescription: "Audit Order: what a person can do here."\ndomain: domains/order\ndependencies: [capabilities/charge-card]\nelements: []\npath: src/order/audit.ts\nsymbol: auditOrder\n---\n\n# Audit Order\n\nA fixture node about Audit Order.\n';
add('imports', 'infer-imports-after-a-vault-write', { vault: 'miniature-repo' }, [
  call('infer_imports', { rootPath: '$PARENT' }),
  { $: 'write-file', path: 'capabilities/audit-order.md', text: auditNode },
  call('infer_imports', { rootPath: '$PARENT' }),
  { $: 'write-file', path: '../src/order/audit.ts', text: "import { charge } from '../payment/charge';\nexport const audit = charge;\n" },
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'full', allowLargeResponse: true }),
  call('infer_imports', { rootPath: '$PARENT', reviewMode: 'next' }),
]);
add('imports', 'infer-imports-atlas-ontology-vault-as-root',{ vault: 'atlas-ontology' }, [call('infer_imports', { rootPath: '$VAULT' })]);
add('imports', 'inspect-architecture-atlas-ontology-vault-as-root',{ vault: 'atlas-ontology' }, [call('inspect_architecture', { rootPath: '$VAULT' })]);

// ---------------------------------------------------------------------------------------------
// evidence: list_concepts mentions, read_source, the agent brief
// ---------------------------------------------------------------------------------------------

add('evidence', 'find-evidence-miniature-repo', { vault: 'miniature-repo' }, [
  call('list_concepts', { mentions: 'Place Order' }),
  call('list_concepts', { mentions: 'Charge Card' }),
  call('list_concepts', { mentions: 'charge' }),
  call('list_concepts', { mentions: 'Cancel Order', limit: 1 }),
  call('list_concepts', { mentions: 'Cancel Order' }),
  call('list_concepts', { mentions: 'Invoice' }),
  call('list_concepts', { mentions: 'Carrier' }),
  call('list_concepts', { mentions: 'ledger balance' }),
  call('list_concepts', { mentions: 'StockLevel' }),
  call('list_concepts', { mentions: 'no such thing anywhere' }),
  call('list_concepts', { mentions: '' }),
  call('list_concepts', { mentions: '   ' }),
  call('list_concepts', { mentions: '\uacb0\uc81c' }),
  call('list_concepts', { mentions: 'a'.repeat(5000) }),
  call('list_concepts', { mentions: 'TOKEN' }),
  call('list_concepts', { mentions: 'sentinel' }),
]);
for (const vault of ['storefront', 'edge-names', 'edge-hostile']) {
  add('evidence', `find-evidence-${vault}`, { vault }, [
    call('list_concepts', { mentions: 'Cart' }),
    call('list_concepts', { mentions: 'Order' }),
    call('list_concepts', { mentions: '\uc8fc\ubb38 \ucde8\uc18c' }),
    call('list_concepts', { mentions: 'Éclair' }),
    call('list_concepts', { mentions: 'Éclair'.normalize('NFD') }),
    call('list_concepts', { mentions: 'Cancel', limit: 2 }),
    call('list_concepts', { mentions: 'secret' }),
    call('list_concepts', { mentions: 'SECRET-SENTINEL-outside' }),
  ]);
}
add('evidence', 'read-source-miniature-repo', { vault: 'miniature-repo' }, [
  call('read_source', { path: 'src/order/placement.ts' }),
  call('read_source', { path: 'src/order/placement.ts', from: 2, limit: 3 }),
  call('read_source', { path: 'src/order/placement.ts', from: 0 }),
  call('read_source', { path: 'src/order/placement.ts', from: 999 }),
  call('read_source', { path: 'src/order/placement.ts', limit: 0 }),
  call('read_source', { path: 'src/core/lib.rs' }),
  call('read_source', { path: 'src/shipping/Carrier.java' }),
  call('read_source', { path: 'src/billing/invoice.py', from: 3 }),
  call('read_source', { path: 'README.md' }),
  call('read_source', { path: 'package.json' }),
  call('read_source', { path: 'src' }),
  call('read_source', { path: 'src/missing.ts' }),
  call('read_source', { path: 'src/order/placement.ts', sheet: 1 }),
  call('read_source', { path: 'SRC/ORDER/PLACEMENT.TS' }),
  call('read_source', { path: 'ontology/miniature-shop.md' }),
  call('read_source', { path: 'ontology/notes.md' }),
  call('read_source', { path: '' }),
  call('read_source', { path: 'src//order/./placement.ts' }),
  call('read_source', { path: 'src\\order\\placement.ts' }),
]);
add('evidence', 'read-source-library-files', { vault: 'library' }, [
  call('read_source', { path: 'sources/notes.md' }),
  call('read_source', { path: 'sources/data.csv' }),
  call('read_source', { path: 'sources/data.csv', sheet: 0 }),
  call('read_source', { path: 'wiki/plan.md', from: 1, limit: 4 }),
  call('read_source', { path: 'sources/missing.md' }),
]);
add('evidence', 'read-source-bytes', { vault: 'edge-bytes' }, [
  call('read_source', { path: 'capabilities/crlf.md' }),
  call('read_source', { path: 'capabilities/bom.md' }),
  call('read_source', { path: 'capabilities/bom.md', from: 1, limit: 2 }),
  call('read_source', { path: 'invalid-utf8.md' }),
  call('read_source', { path: 'capabilities/nul-byte.md' }),
  call('read_source', { path: 'empty-file.md' }),
  call('read_source', { path: 'capabilities/unicode-separators.md', from: 8, limit: 4 }),
  call('read_source', { path: 'capabilities/numbers.md' }),
  call('read_source', { path: 'capabilities/prototype-keys.md' }),
]);
const para = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
const source = (name, text) => ({ $: 'write-file', path: `sources/${name}`, text });
const sourceBytes = (name, base64, extra = {}) => ({ $: 'write-file', path: `sources/${name}`, base64, ...extra });
const readSource = (name, args = {}) => call('read_source', { path: `sources/${name}`, ...args });
add('evidence', 'read-source-office-and-tables', { vault: 'library' }, [
  sourceBytes('plan.docx', docxOf([
    para('Order plan', 'Heading1'), para('Charge the card first.'), para('Order plan', 'Heading1'), para('Then ship it.'),
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>sku</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>qty &amp; unit</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    para('Notes', 'Heading2'), para('\u3130\u314f\u3131'),
  ].join(''))),
  sourceBytes('refs.docx', docxOf(para('Refund &#x110000; and &#12345678901; kept as written, &#x41; is A'))),
  sourceBytes('book.xlsx', xlsxOf([
    { name: 'Orders', rows: [['sku', 'qty'], ['a-1', 3], ['b-2', 4]] },
    { name: 'Refunds', rows: [['reason'], ['late']] },
  ])),
  source('quoted.csv', 'name,note\r\n"Smith, J","said ""hi""\nthen left"\n\n7,\n'),
  source('table.tsv', 'a\tb\n1\t2\n'),
  source('page.html', '<html><head><style>p{}</style><script>var x=1</script></head><body><h1>Title &amp; more</h1><p>one<br>two</p></body></html>'),
  source('lines.txt', 'first\r\n\r\n  third  \nlast'),
  readSource('plan.docx'),
  readSource('plan.docx', { from: 2, limit: 3 }),
  readSource('refs.docx'),
  readSource('book.xlsx'),
  readSource('book.xlsx', { sheet: 2 }),
  readSource('book.xlsx', { sheet: 9 }),
  readSource('quoted.csv'),
  readSource('table.tsv'),
  readSource('page.html'),
  readSource('lines.txt', { from: 2, limit: 1 }),
  readSource('PLAN.DOCX', { limit: 1 }),
]);
add('evidence', 'read-source-hostile-files', { vault: 'library' }, [
  sourceBytes('binary.dat', Buffer.from([0, 1, 2, 3, 255]).toString('base64')),
  sourceBytes('embedded-nul.txt', Buffer.from('text\u0000more').toString('base64')),
  sourceBytes('scan.pdf', Buffer.from('%PDF-1.7 not text').toString('base64')),
  sourceBytes('broken.docx', Buffer.from('this is not a zip archive').toString('base64')),
  sourceBytes('cut.docx', docxCutShort()),
  sourceBytes('empty.xlsx', xlsxOf([])),
  sourceBytes('bomb.docx', docxPastTheUnpackBudget()),
  sourceBytes('long-lines.txt', Buffer.from(`${'x'.repeat(5000)}\n`).toString('base64'), { repeat: 40 }),
  sourceBytes('many-lines.txt', Buffer.from('line\n').toString('base64'), { repeat: 5000 }),
  { $: 'write-file', path: 'sources/huge.txt', text: '', size: 101 * 1024 * 1024 },
  source('.env', 'KEY=value\n'),
  source('secrets.txt', 'password\n'),
  source('server.pem', 'key\n'),
  { $: 'symlink', path: 'sources/linked.md', target: '/etc/hosts' },
  { $: 'mkdir', path: 'sources/folder.md' },
  readSource('binary.dat'),
  readSource('embedded-nul.txt'),
  readSource('scan.pdf'),
  readSource('broken.docx'),
  readSource('cut.docx'),
  readSource('empty.xlsx'),
  readSource('bomb.docx'),
  readSource('long-lines.txt', { from: 39, limit: 5 }),
  readSource('many-lines.txt', { from: 4990, limit: 1000 }),
  readSource('many-lines.txt', { limit: 1000 }),
  readSource('huge.txt'),
  readSource('.env'),
  readSource('secrets.txt'),
  readSource('server.pem'),
  readSource('linked.md'),
  readSource('folder.md'),
  readSource('notes.md/extra'),
  call('read_source', { path: `sources/${'deep/'.repeat(1200)}file.txt` }),
  call('read_source', { path: 'sources/../wiki/plan.md' }),
  call('read_source', { path: 'sources\\notes.md' }),
  call('read_source', { path: 'sources/' }),
  call('read_source', { path: 'sources' }),
]);
add('evidence', 'read-source-argument-bounds', { vault: 'library' }, [
  readSource('notes.md', { from: 0 }),
  readSource('notes.md', { from: 1.5 }),
  readSource('notes.md', { from: '2' }),
  readSource('notes.md', { limit: 0 }),
  readSource('notes.md', { limit: 1001 }),
  readSource('notes.md', { limit: 1000 }),
  readSource('notes.md', { sheet: 0 }),
  readSource('notes.md', { from: -1 }),
  call('read_source', {}),
  call('read_source', { path: 5 }),
  readSource('notes.md:stream'),
  readSource('CON.md'),
  readSource('com1'),
]);
add('evidence', 'find-evidence-unicode-and-typos', { vault: 'storefront' }, [
  { $: 'write-file', path: 'capabilities/ko-note.md', text: `---\nuid: 3c1f4b8e-5a2d-4c7e-9b1a-0d6e8f2a4c10\nslug: capabilities/ko-note\nkind: capability\ntitle: ${'\uc8fc\ubb38 \ucde8\uc18c'.normalize('NFD')}\ndomain: domains/order\n---\n\nBody about ${'\uacb0\uc81c \uc2b9\uc778'.normalize('NFD')} and Café au lait.\n` },
  { $: 'touch', path: 'capabilities/ko-note.md', mtimeMs: 1_700_000_500_000 },
  call('list_concepts', { mentions: '\uc8fc\ubb38 \ucde8\uc18c' }),
  call('list_concepts', { mentions: '\uc8fc\ubb38 \ucde8\uc18c'.normalize('NFD') }),
  call('list_concepts', { mentions: '\uacb0\uc81c \uc2b9\uc778' }),
  call('list_concepts', { mentions: 'Café au lait' }),
  call('list_concepts', { mentions: 'CAFÉ' }),
  call('list_concepts', { mentions: 'Crat' }),
  call('list_concepts', { mentions: 'Plce Order' }),
  call('list_concepts', { mentions: 'Adres Bok' }),
  call('list_concepts', { mentions: '\uc8fc\ubb38 \ucde8\uc190' }),
  call('list_concepts', { mentions: '\ucde8\uc18c \uc8fc\ubb38 \uc2b9' }),
  call('list_concepts', { mentions: 'refund policy for returns' }),
  call('list_concepts', { mentions: 'x'.repeat(300) }),
]);
add('evidence', 'find-evidence-hostile-queries', { vault: 'storefront' }, [
  call('list_concepts', { mentions: Array.from({ length: 4000 }, (_, i) => `term${i}`).join(' ') }),
  call('list_concepts', { mentions: 'a '.repeat(20000).trim() }),
  call('list_concepts', { mentions: '\u0000' }),
  call('list_concepts', { mentions: 'cart\u0000' }),
  call('list_concepts', { mentions: '😀' }),
  call('list_concepts', { mentions: 'Cart', limit: 0 }),
  call('list_concepts', { mentions: 'Cart', limit: 501 }),
  call('list_concepts', { mentions: 'Cart', limit: 1.5 }),
  call('list_concepts', { mentions: 5 }),
]);
add('evidence', 'agent-brief-operations', { vault: 'miniature-repo' }, [
  call('query_ontology', { operation: 'agent_brief', slug: 'capabilities/place-order' }),
  call('query_ontology', { operation: 'workspace_brief' }),
]);
add('evidence', 'agent-brief-storefront', { vault: 'storefront' }, [
  call('query_ontology', { operation: 'workspace_brief' }),
]);

// ---------------------------------------------------------------------------------------------
// survey: analyze_repo_structure
// ---------------------------------------------------------------------------------------------

add('survey', 'analyze-repo-structure-miniature', { vault: 'miniature-repo' }, [
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT', ignore: ['src/billing'] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceOnly: true }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/placement.ts', symbol: 'placeOrder' }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/placement.ts', mode: 'outline' }, { path: 'src/payment/charge.ts', startLine: 1, maxLines: 4 }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: '../outside.ts', mode: 'outline' }, { path: '/etc/hosts', mode: 'outline' }, { path: '.env', mode: 'outline' }] }),
  call('analyze_repo_structure', {}),
  call('analyze_repo_structure', { rootPath: '$PARENT/src' }),
  call('analyze_repo_structure', { rootPath: '$PARENT/does-not-exist' }),
]);
add('survey', 'analyze-repo-structure-vaults', { vault: 'storefront' }, [
  call('analyze_repo_structure', { rootPath: '$VAULT' }),
  call('analyze_repo_structure', {}),
]);
for (const vault of ['edge-names', 'edge-bytes', 'edge-hostile', 'library', 'empty']) {
  add('survey', `analyze-repo-structure-${vault}`, { vault }, [
    call('analyze_repo_structure', { rootPath: '$VAULT' }),
    call('analyze_repo_structure', { rootPath: '$VAULT', sourceOnly: true }),
  ]);
}
add('survey', 'analyze-repo-structure-atlas-ontology', { vault: 'atlas-ontology' }, [
  call('analyze_repo_structure', { rootPath: '$VAULT' }),
]);
add('survey', 'analyze-repo-structure-polyglot', { vault: 'survey-polyglot' }, [
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT', ignore: ['vendor', 'internal'] }),
  call('analyze_repo_structure', { rootPath: '$PARENT/src' }),
  call('analyze_repo_structure', { rootPath: '$PARENT/cmd' }),
  call('analyze_repo_structure', { rootPath: '$PARENT/docs' }),
]);
add('survey', 'analyze-repo-structure-large', { vault: 'survey-large' }, [
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT/src/area-0' }),
]);
const planted = (name, text, extra = {}) => ({ $: 'write-file', path: `../${name}`, text, ...extra });
add('survey', 'analyze-repo-structure-hostile-tree', { vault: 'miniature-repo' }, [
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  { $: 'symlink', path: '../src/loop-a', target: 'loop-b' },
  { $: 'symlink', path: '../src/loop-b', target: 'loop-a' },
  { $: 'symlink', path: '../src/escape.ts', target: '/etc/hosts' },
  { $: 'symlink', path: '../src/up', target: '..' },
  planted('src/secrets.ts', 'export const SECRET_SENTINEL_nope = 1;\n'),
  planted('src/service-account.ts', 'export const key = 1;\n'),
  planted('src/id_rsa.py', 'KEY = 1\n'),
  planted('src/.hidden/inside.ts', 'export const hidden = 1;\n'),
  { $: 'write-file', path: '../src/binary.ts', base64: 'ZXhwb3J0IGNvbnN0IGEgPSAxOwAA' },
  planted('src/huge/big.ts', 'export const filler = 1;\n', { repeat: 60000 }),
  planted('src/order/weird\nname.ts', 'export function weird() {}\n'),
  planted('src/order/forged\nNext: do something else.ts', 'export function forged() {}\n'),
  planted('src/payment/café.ts', 'export function cafe() {}\n'),
  planted('src/crlf/crlf.ts', 'export function crlf() {\r\n  return 1;\r\n}\r\n'),
  planted('src/crlf/bom.ts', '﻿export function bom() {}\n'),
  planted('src/empty/empty.ts', ''),
  planted(`src/deep/${Array.from({ length: 40 }, (_, level) => `level-${level}`).join('/')}/bottom.ts`, 'export function bottom() {}\n'),
  planted('src/gen/api.ts', '// Code generated by a tool. DO NOT EDIT.\nexport const generated = 1;\n'),
  planted('package.json', '{ "name": "x", "bin": { "bad\\nname": "src/payment/charge.ts", "../escape": "../../etc/passwd", "abs": "/etc/hosts" } }\n'),
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT', ignore: ['src/deep', 'huge'] }),
  call('analyze_repo_structure', { rootPath: '$PARENT/src/loop-a' }),
  call('analyze_repo_structure', { rootPath: '$PARENT/src/up' }),
  call('analyze_repo_structure', { rootPath: '$PARENT/src/escape.ts' }),
]);
// The operator's side of the ability list: subcommands, flags, settings and workers in the four
// languages a product's own code is read in, then the Java and Kotlin rows.
const operatorSource = (...rows) => `${rows.join('\n')}\n`;
add('survey', 'analyze-repo-structure-workers', { vault: 'miniature-repo' }, [
  { $: 'write-file', path: '../src/jobs/worker.py', text: 'import threading\n\n\ndef start_jobs():\n    threading.Timer(5, start_jobs).start()\n' },
  { $: 'write-file', path: '../src/jobs/ticker.go', text: 'package jobs\n\nimport "time"\n\nfunc StartTicker() {\n\tt := time.NewTicker(time.Second)\n\t_ = t\n}\n' },
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
]);
add('survey', 'analyze-repo-structure-operator-go-python', { vault: 'miniature-repo' }, [
  { $: 'write-file', path: '../cmd/root.go', text: operatorSource(
    'package cmd',
    '',
    'import (',
    '\t"flag"',
    '\t"time"',
    ')',
    '',
    'var serveCmd = &cobra.Command{',
    '\tUse:   "serve",',
    '\tShort: "run the server",',
    '}',
    '',
    'var helpCmd = &cobra.Command{',
    '\tUse: "help",',
    '}',
    '',
    'var app = &cli.Command{',
    '\tName: "migrate",',
    '}',
    '',
    'func registerCacheFlags() {',
    '\tflag.Bool("cache-dir", false, "")',
    '\tflag.String("cache-ttl", "", "")',
    '\tflag.Bool("dry-run", false, "")',
    '\tflag.Bool("verbose", false, "")',
    '\tflag.StringVar(&name, "name", "", "")',
    '}',
    '',
    'var fl = &cli.BoolFlag{',
    '\tName:     "sync-all",',
    '\tCategory: "SYNC OPTIONS:",',
    '}',
    '',
    'type ServerConfig struct {',
    '\tMetrics metrics.Config',
    '\tPublicMode bool',
    '\tName string',
    '\tNested struct {',
    '\t\tEnableX bool',
    '\t}',
    '}',
    '',
    'type Pulse struct{}',
    '',
    'func (p *Pulse) Start() {',
    '\tt := time.NewTicker(time.Second)',
    '\t_ = t',
    '}',
    '',
    'func TestPulse() {',
    '\ttime.NewTicker(1)',
    '}',
  ) },
  { $: 'write-file', path: '../src/jobs/cli.py', text: operatorSource(
    'import argparse',
    'import threading',
    'import click',
    'import typer',
    'import tyro',
    'from dataclasses import dataclass',
    '',
    'def build(parser):',
    '    sub = parser.add_subparsers()',
    '    sub.add_parser("export")',
    '    sub.add_parser("import-all")',
    '    group = parser.add_argument_group("Signed streams")',
    '    group.add_argument("--sign", action="store_true")',
    '    group.add_argument("--stream-key")',
    '    parser.add_argument("--dry-run", action="store_true")',
    '    parser.add_argument("--json", action="store_true")',
    '',
    '@click.option("--fast", is_flag=True)',
    '@click.option("--level", default=1)',
    'def run():',
    '    pass',
    '',
    '@app.command()',
    'def clean_cache():',
    '    pass',
    '',
    '@app.command("rebuild")',
    'def anything():',
    '    pass',
    '',
    '@dataclass',
    'class TrainModel:',
    '    epochs: int = 3',
    '    def run(self):',
    '        pass',
    '',
    'class CacheSettings:',
    '    enabled: bool = True',
    '    use_disk: bool = False',
    '    ttl: int = 5',
    '    other: OtherConfig = None',
    '',
    'class Pump:',
    '    def start(self):',
    '        threading.Timer(5, self.start).start()',
    '',
    'def test_pump():',
    '    threading.Thread(target=run).start()',
  ) },
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
]);
add('survey', 'analyze-repo-structure-operator-script-rust', { vault: 'miniature-repo' }, [
  { $: 'write-file', path: '../bin/cli.ts', text: operatorSource(
    "import { Command } from 'commander';",
    'const program = new Command();',
    "program.command('build');",
    "program.command('help');",
    "program.option('--watch').option('--out-dir <dir>').option('--out-file <file>');",
    "program.requiredOption('--token <value>');",
    'const options = [',
    "  { name: 'preview', type: Boolean },",
    "  { name: 'target', type: String },",
    ']',
    'export interface ServerOptions {',
    '  enableCache: boolean;',
    '  port: number;',
    '  metrics: MetricsConfig;',
    '}',
    'export type OneLine = { enableX: boolean };',
    'const TICK_MS = 500;',
    'function clock() {',
    '  setInterval(() => show(Date.now()), TICK_MS);',
    '}',
    'function poll() {',
    '  setInterval(check, 30000);',
    '}',
    'class Sync {',
    '  start() {',
    "    const w = new Worker('w.js');",
    '  }',
    '}',
  ) },
  { $: 'write-file', path: '../src/ui/Clock.tsx', text: operatorSource('export function Clock() {', '  setInterval(refresh, 30000);', '  return null;', '}') },
  { $: 'write-file', path: '../src/hooks/useThing.ts', text: operatorSource('export interface ThingOptions {', '  enableFoo: boolean;', '}', 'export interface ThingSettings {', '  enableBar: boolean;', '}') },
  { $: 'write-file', path: '../crates/tool/src/main.rs', text: operatorSource(
    'use clap::{Parser, Subcommand};',
    '',
    '#[derive(Subcommand)]',
    'enum Action {',
    '    SyncVault { force: bool },',
    '    Check,',
    '}',
    '',
    '#[derive(Parser)]',
    'struct Args {',
    '    #[arg(long)]',
    '    dry_run: bool,',
    '    #[arg(long, short)]',
    '    quiet: bool,',
    '    #[arg(long)]',
    '    output_dir: String,',
    '    #[arg(long)]',
    '    output_format: String,',
    '}',
    '',
    'pub struct AppConfig {',
    '    pub enable_cache: bool,',
    '    pub name: String,',
    '    pub section: SectionConfig,',
    '}',
    '',
    'impl Pump {',
    '    fn start(&self) {',
    '        thread::spawn(move || {',
    '            loop_forever();',
    '        });',
    '    }',
    '    fn capture(&self) {',
    '        thread::spawn(move || {',
    '            stdout.read_to_end(&mut buf);',
    '        });',
    '    }',
    '}',
    '',
    '#[cfg(test)]',
    'mod tests {',
    '    fn t() {',
    '        thread::spawn(|| {});',
    '    }',
    '}',
  ) },
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
]);
add('survey', 'analyze-repo-structure-jvm-abilities', { vault: 'miniature-repo' }, [
  { $: 'write-file', path: '../service/src/main/java/shop/api/BaseResource.java', text: operatorSource(
    'package shop.api;',
    'import org.springframework.web.bind.annotation.*;',
    'public abstract class BaseResource {',
    '  @GetMapping("/ping")',
    '  public String ping() { return ""; }',
    '}',
  ) },
  { $: 'write-file', path: '../service/src/main/java/shop/api/OrderController.java', text: operatorSource(
    'package shop.api;',
    'import org.springframework.web.bind.annotation.*;',
    '@RestController',
    '@RequestMapping("/orders")',
    'public class OrderController extends BaseResource {',
    '  // @GetMapping("/commented")',
    '  @PostMapping',
    '  public void make() {}',
    '  @RequestMapping(value = {"/a", "/b"}, method = RequestMethod.PUT)',
    '  public void change() {}',
    '  @GetMapping(PATH)',
    '  public void constant() {}',
    '  String text = "@DeleteMapping(\\"/in-a-string\\")";',
    '}',
  ) },
  { $: 'write-file', path: '../service/src/main/java/shop/api/ItemResource.java', text: operatorSource(
    'package shop.api;',
    'import jakarta.ws.rs.*;',
    '@Path("/items")',
    'public class ItemResource {',
    '  @GET',
    '  @Path("{id}")',
    '  public String get() { return ""; }',
    '  @DELETE',
    '  public void remove() {}',
    '}',
  ) },
  { $: 'write-file', path: '../service/src/main/java/shop/Boot.java', text: operatorSource(
    'package shop;',
    'public class Boot {',
    '  public static void main(String[] args) {}',
    '}',
  ) },
  { $: 'write-file', path: '../service/src/main/java/shop/jobs/Digest.java', text: operatorSource(
    'package shop.jobs;',
    'import org.springframework.scheduling.annotation.Scheduled;',
    'public class Digest {',
    '  @Scheduled(fixedRate = 5)',
    '  void send() {}',
    '  @KafkaListener(topics = "a")',
    '  void consume() {}',
    '  void arm() {',
    '    pool.scheduleAtFixedRate(task, 1, 1, SECONDS);',
    '  }',
    '}',
  ) },
  { $: 'write-file', path: '../service/src/main/java/shop/handlers/Handler.java', text: operatorSource('package shop.handlers;', 'public interface Handler {}') },
  { $: 'write-file', path: '../service/src/main/java/shop/handlers/Alpha.java', text: operatorSource('package shop.handlers;', 'public class Alpha implements Handler {}') },
  { $: 'write-file', path: '../service/src/main/java/shop/handlers/Beta.java', text: operatorSource('package shop.handlers;', 'public class Beta implements Handler {}') },
  { $: 'write-file', path: '../service/src/main/java/shop/handlers/Gamma.java', text: operatorSource('package shop.handlers;', 'public class Gamma implements Handler {}') },
  { $: 'write-file', path: '../service/src/main/kotlin/shop/Launch.kt', text: operatorSource(
    'package shop',
    'fun main(args: Array<String>) {}',
    'object Tools {',
    '  @JvmStatic fun main(args: Array<String>) {}',
    '}',
  ) },
  { $: 'write-file', path: '../service/src/main/kotlin/shop/Tasks.kt', text: operatorSource(
    'package shop',
    'import org.springframework.scheduling.annotation.Scheduled',
    'class Tasks {',
    '  @Scheduled(cron = "0 * * * * *") fun tick() {}',
    '}',
  ) },
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
]);
// Hangul inside annotation arguments and signature windows: the script server counts UTF-16
// units of the original, so the text before `value`, a comment between an annotation and its
// parenthesis, and a comment inside a `main` signature all weigh one unit per letter.
const hangulOrder = '\uC8FC\uBB38 \uC870\uD68C';
add('survey', 'analyze-repo-structure-jvm-hangul-annotations', { vault: 'miniature-repo' }, [
  { $: 'write-file', path: '../service/src/main/java/shop/api/HangulController.java', text: operatorSource(
    'package shop.api;',
    'import org.springframework.web.bind.annotation.*;',
    '@RestController',
    'public class HangulController {',
    `  @GetMapping(name = "${hangulOrder}", // ${hangulOrder}`,
    '      value = "/orders/{id}")',
    '  public void read() {}',
    `  @PutMapping /* ${'\uAC00'.repeat(30)} */ ("/long")`,
    '  public void change() {}',
    '}',
  ) },
  { $: 'write-file', path: '../service/src/main/java/shop/HangulBoot.java', text: operatorSource(
    'package shop;',
    'public class HangulBoot {',
    `  public static void /* ${'\uAC00'.repeat(100)} */ main(String[] args) {}`,
    '}',
  ) },
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
]);
// A Python task decorator below the first line: the script server asks the whole file for a
// pattern anchored at its first line, so it never sees one (row 47).
add('survey', 'analyze-repo-structure-celery-task', { vault: 'miniature-repo' }, [
  { $: 'write-file', path: '../jobs/tasks.py', text: 'import celery\n\n\n@shared_task\ndef send_digest():\n    pass\n' },
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
]);
// Exact source reads (`sourceReads`): the code a symbol read serves beside its body. A planted
// repository in five languages holds what ranks a context part: a base class and its override, a
// field whose type is unnamed and three stores that each declare the method called on it, a
// caller's guard, a constant, imports by name, by alias and by namespace, Go receivers and a
// package, a Rust `use`, a Java constructor.
const plantedRepository = {
  'app/__init__.py': '',
  'app/base.py': 'DEFAULT_LIMIT = 3\nHEADER_NAME = "X-RESUME-ID"\n\n\nclass Base:\n    """The base of every service."""\n\n    retries = 3\n    enabled = True\n\n    def __init__(self, store, limit=DEFAULT_LIMIT):\n        self.store = store\n        self.limit = limit\n\n    def check(self, item):\n        if item is None:\n            raise ValueError("item is required")\n        return item\n\n    def run(self, item):\n        if not self.enabled:\n            return None\n        return self.check(item)\n',
  'app/service.py': 'from .base import Base, HEADER_NAME\nfrom .stores import make_store\n\n\nclass Service(Base):\n    def __init__(self, limit=5):\n        super().__init__(make_store(), limit)\n\n    def check(self, item):\n        if len(item) > self.limit:\n            raise ValueError(HEADER_NAME)\n        return super().check(item)\n\n    def handle(self, item):\n        checked = self.check(item)\n        self.store.save(checked)\n        return self.finish(checked)\n\n    def finish(self, value):\n        return value if value else None\n',
  'app/stores.py': 'class MemoryStore:\n    def save(self, item):\n        if item in self.items:\n            raise KeyError(item)\n        self.items.append(item)\n\n\nclass DiskStore:\n    def save(self, item):\n        if not item:\n            return None\n        return open(item).read()\n\n\nclass NullStore:\n    def save(self, item):\n        return None\n\n\ndef make_store():\n    return MemoryStore()\n',
  'app/api.py': 'from app.service import Service\n\n\ndef endpoint(item):\n    service = Service()\n    if item.startswith("x"):\n        return None\n    return service.handle(item)\n\n\ndef other(item):\n    return Service().handle(item)\n',
  'web/order.ts': "import { Cart } from './cart';\nimport { limitFor, MAX_ITEMS } from './limits';\nimport * as audit from './audit';\n\nexport class OrderService {\n  private readonly cart: Cart;\n\n  constructor(cart: Cart = new Cart()) {\n    this.cart = cart;\n  }\n\n  place(items: string[]): string {\n    if (items.length > MAX_ITEMS) {\n      throw new Error('too many');\n    }\n    audit.record(items);\n    return this.finalize(limitFor(items));\n  }\n\n  private finalize(count: number): string {\n    return count > 0 ? 'placed' : 'empty';\n  }\n}\n",
  'web/limits.ts': 'export const MAX_ITEMS = 10;\n\nexport function limitFor(items: string[]): number {\n  if (items.length === 0) {\n    return 0;\n  }\n  return Math.min(items.length, MAX_ITEMS);\n}\n',
  'web/audit.ts': 'export function record(items: string[]): void {\n  if (!items.length) return;\n  console.log(items);\n}\n',
  'web/cart.ts': 'export class Cart {\n  items: string[] = [];\n  add(item: string): void {\n    this.items.push(item);\n  }\n}\n',
  'web/page.ts': "import { OrderService } from './order';\n\nexport function submit(items: string[]): string {\n  const service = new OrderService();\n  if (items.length === 0) {\n    return 'nothing';\n  }\n  return service.place(items);\n}\n",
  'svc/node.go': 'package svc\n\ntype Node struct {\n\tpeers []string\n}\n\nfunc (n *Node) Subscribe(topic string) bool {\n\tif topic == "" {\n\t\treturn false\n\t}\n\treturn n.register(topic)\n}\n\nfunc (n *Node) register(topic string) bool {\n\tn.peers = append(n.peers, topic)\n\treturn true\n}\n',
  'svc/util.go': 'package svc\n\nfunc Normalize(topic string) string {\n\tif topic == "" {\n\t\treturn "default"\n\t}\n\treturn topic\n}\n',
  'svc/main.go': 'package svc\n\nimport "example.com/app/billing"\n\nfunc Run(n *Node) bool {\n\tbilling.Charge(1)\n\treturn n.Subscribe(Normalize("a"))\n}\n',
  'core/lib.rs': 'pub mod ledger;\n\npub fn total(values: &[u32]) -> u32 {\n    if values.is_empty() {\n        return 0;\n    }\n    values.iter().sum()\n}\n',
  'core/ledger.rs': 'use crate::total;\n\npub fn balance() -> u32 {\n    total(&[1, 2, 3])\n}\n',
  'jvm/Carrier.java': 'package jvm;\n\npublic class Carrier {\n  private int retries = 3;\n\n  public Carrier() {\n    this.retries = 5;\n  }\n\n  public String label(String name) {\n    if (name == null) {\n      throw new IllegalArgumentException("name");\n    }\n    return name;\n  }\n}\n',
};
const readSymbol = (path, symbol, extra = {}) => call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path, symbol, ...extra }] });
add('survey', 'analyze-repo-structure-source-reads-code-around', { vault: 'miniature-repo' }, [
  ...Object.entries(plantedRepository).map(([name, text]) => planted(name, text)),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: Object.keys(plantedRepository).filter((name) => name !== 'app/__init__.py').map((name) => ({ path: name, mode: 'outline' })).slice(0, 16) }),
  readSymbol('app/service.py', 'Service.handle'),
  readSymbol('app/service.py', 'check'),
  readSymbol('app/service.py', 'Service.__init__'),
  readSymbol('app/base.py', 'Base.run'),
  readSymbol('app/base.py', 'Base'),
  readSymbol('app/api.py', 'endpoint'),
  readSymbol('web/order.ts', 'OrderService.place'),
  readSymbol('web/order.ts', 'constructor'),
  readSymbol('web/limits.ts', 'limitFor'),
  readSymbol('web/page.ts', 'submit'),
  readSymbol('svc/node.go', 'Subscribe'),
  readSymbol('svc/node.go', 'Node.Subscribe'),
  readSymbol('svc/main.go', 'Run'),
  readSymbol('core/ledger.rs', 'balance'),
  readSymbol('core/lib.rs', 'total'),
  readSymbol('jvm/Carrier.java', 'Carrier.label'),
  readSymbol('app/service.py', 'Service.handle', { maxLines: 2 }),
  readSymbol('app/service.py', 'nothing'),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: 'app/service.py', symbol: 'Service.handle' },
    { path: 'web/order.ts', symbol: 'OrderService.place' },
    { path: 'svc/main.go', symbol: 'Run' },
    { path: 'app/base.py', symbol: 'Base.check' },
    { path: 'web/page.ts', startLine: 1, maxLines: 4 },
    { path: 'core/lib.rs', mode: 'outline' },
  ] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceOnly: true, sourceReads: [{ path: 'app/service.py', symbol: 'Service.finish' }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT/app', sourceReads: [{ path: 'service.py', symbol: 'Service.handle' }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', ignore: ['app'], sourceReads: [{ path: 'app/service.py', symbol: 'Service.handle' }, { path: 'web/order.ts', symbol: 'OrderService.place' }] }),
]);
// Files and paths a stranger could plant: each read is refused for its own reason, or served as
// the file holds it.
add('survey', 'analyze-repo-structure-source-reads-hostile-files', { vault: 'miniature-repo' }, [
  planted('src/crlf/crlf.ts', 'export function crlf() {\r\n  return 1;\r\n}\r\n'),
  planted('src/crlf/lone.ts', 'export function lone() {\r  return 1;\r}\r'),
  planted('src/crlf/bom.ts', '\ufeffexport function bom() {}\n'),
  planted('src/empty/empty.ts', ''),
  planted('src/oneline/one.java', 'public class One { public String label() { return "one"; } }\n'),
  planted('src/oneline/one.ts', 'export class One { open(): void {} close(): void { return; } }\n'),
  { $: 'write-file', path: '../src/binary/binary.ts', base64: 'ZXhwb3J0IGNvbnN0IGEgPSAxOwAA' },
  { $: 'write-file', path: '../src/binary/latin1.ts', base64: 'ZXhwb3J0IGNvbnN0IGEgPSAn/yc7Cg==' },
  planted('src/wide/line.ts', `export const wide = '${'x'.repeat(9000)}';\n`),
  planted('src/wide/many.ts', 'export function many() {\n  return 1;\n}\n', { repeat: 12000 }),
  planted('src/wide/huge.ts', 'export const filler = 1;\n', { repeat: 12000 }),
  planted('src/deep/name.ts', `export function ${'n'.repeat(5000)}() {}\n`),
  planted('src/.hidden/inside.ts', 'export const hidden = 1;\n'),
  planted('src/node_modules/pkg/index.ts', 'export const pkg = 1;\n'),
  planted('src/secrets.ts', 'export const SECRET_SENTINEL_no = 1;\n'),
  planted('src/id_rsa.py', 'KEY = 1\n'),
  planted('src/private_key.py', 'KEY = 2\n'),
  planted('src/con.ts', 'export function device() {}\n'),
  planted('src/sig/split.ts', `export function split(a = '${'\u{1f600}'.repeat(80)}') {}\n`),
  planted('src/sig/even.ts', `export function even(a = '${'\u{1f600}'.repeat(80)}') {}\n`),
  planted('src/sig/space.ts', '\u0085\u00a0\u2003export function space() {}\u0085\n'),
  planted('src/payment/caf\u00e9.ts', 'export function cafe() {}\n'),
  planted('src/order/weird\nname.ts', 'export function weird() {}\n'),
  planted('notes.txt', 'plain text\n'),
  planted('Makefile', 'all:\n\techo built\n'),
  { $: 'symlink', path: '../src/escape.ts', target: '/etc/hosts' },
  { $: 'symlink', path: '../src/linked.ts', target: 'order/cancel.ts' },
  { $: 'symlink', path: '../src/linked-dir', target: 'order' },
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: 'src/crlf/crlf.ts', symbol: 'crlf' },
    { path: 'src/crlf/lone.ts', mode: 'outline' },
    { path: 'src/crlf/bom.ts', startLine: 1, maxLines: 2 },
    { path: 'src/empty/empty.ts', startLine: 1, maxLines: 1 },
    { path: 'src/empty/empty.ts', mode: 'outline' },
  ] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: 'src/oneline/one.java', mode: 'outline' },
    { path: 'src/oneline/one.ts', mode: 'outline' },
    { path: 'src/oneline/one.java', symbol: 'One.label' },
    { path: 'src/oneline/one.ts', symbol: 'One.close' },
  ] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: 'src/binary/binary.ts', mode: 'outline' },
    { path: 'src/binary/latin1.ts', startLine: 1, maxLines: 1 },
    { path: 'src/wide/line.ts', startLine: 1, maxLines: 1 },
    { path: 'src/wide/many.ts', startLine: 1, maxLines: 200 },
    { path: 'src/wide/many.ts', mode: 'outline' },
    { path: 'src/wide/huge.ts', startLine: 11990, maxLines: 20 },
    { path: 'src/wide/huge.ts', startLine: 12001, maxLines: 1 },
    { path: 'src/deep/name.ts', mode: 'outline' },
  ] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: 'src/.hidden/inside.ts', mode: 'outline' },
    { path: 'src/node_modules/pkg/index.ts', mode: 'outline' },
    { path: 'src/secrets.ts', mode: 'outline' },
    { path: 'src/id_rsa.py', mode: 'outline' },
    { path: '.env', mode: 'outline' },
    { path: 'package.json', mode: 'outline' },
    { path: 'src/payment/caf\u00e9.ts', mode: 'outline' },
    { path: 'src/order/weird\nname.ts', mode: 'outline' },
    { path: 'notes.txt', mode: 'outline' },
    { path: 'Makefile', mode: 'outline' },
    { path: 'src/escape.ts', mode: 'outline' },
    { path: 'src/linked.ts', mode: 'outline' },
    { path: 'src/linked-dir/cancel.ts', mode: 'outline' },
    { path: 'src', mode: 'outline' },
    { path: 'src/missing.ts', mode: 'outline' },
    { path: 'README.md', mode: 'outline' },
  ] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: '../outside.ts', mode: 'outline' },
    { path: 'src/../src/order/cancel.ts', mode: 'outline' },
    { path: '/etc/hosts', mode: 'outline' },
    { path: 'C:\\Windows\\win.ini', mode: 'outline' },
    { path: 'src\\order\\cancel.ts', mode: 'outline' },
    { path: 'src//order/cancel.ts', mode: 'outline' },
    { path: './src/order/cancel.ts', mode: 'outline' },
    { path: 'src/order/cancel.ts/', mode: 'outline' },
    { path: 'src/order/cancel.ts\u0000x', mode: 'outline' },
    { path: `src/${'a'.repeat(5000)}.ts`, mode: 'outline' },
    { path: 'SRC/ORDER/CANCEL.TS', mode: 'outline' },
    { path: 'src/order/cancel.ts:stream', mode: 'outline' },
  ] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', startLine: 1, maxLines: 3, expectedSha256: '0'.repeat(64) }, { path: 'src/order/cancel.ts', startLine: 4, maxLines: 5 }, { path: 'src/order/cancel.ts', startLine: 99, maxLines: 5 }, { path: 'src/order/cancel.ts', symbol: 'cancelOrder', maxLines: 1 }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', startLine: 1, maxLines: 3, expectedSha256: 'NOT-A-HASH' }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: Array.from({ length: 17 }, () => ({ path: 'src/order/cancel.ts', mode: 'outline' })) }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: Array.from({ length: 16 }, (_, index) => ({ path: 'src/wide/many.ts', startLine: index * 200 + 1, maxLines: 200 })) }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: 'src/order/cancel.ts' }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [null] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{}] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 5 }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', symbol: 'cancelOrder', startLine: 1 }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', mode: 'tree' }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', startLine: 0, maxLines: 1 }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', startLine: 1, maxLines: 201 }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', startLine: 1.5, maxLines: 2 }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', mode: 'outline', extra: true }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', symbol: '' }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', symbol: 'a'.repeat(3000) }] }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceOnly: true }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/cancel.ts', mode: 'outline' }] }),
  // A Kelvin sign is the letter K to a case-insensitive disk (APFS, NTFS), so the script server
  // opens `src/private_key.py` by this name (row 50).
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: 'src/private_\u212aey.py', mode: 'outline' },
  ] }),
  // Windows opens `con.ts` as the console, so the name is refused on every system (row 51).
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/con.ts', mode: 'outline' }] }),
  // A signature is the declaration's line trimmed as JavaScript trims it (U+FEFF goes, U+0085
  // stays) and cut to 160 UTF-16 units: the cut of `split` falls inside an emoji, that of `even`
  // between two.
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [
    { path: 'src/crlf/bom.ts', mode: 'outline' },
    { path: 'src/sig/split.ts', mode: 'outline' },
    { path: 'src/sig/even.ts', mode: 'outline' },
    { path: 'src/sig/space.ts', mode: 'outline' },
  ] }),
  ]);
// The parts of `analyze_repo_structure` that are retired. The script server still answers each;
// the Rust server refuses by name, in one sentence, and `null` still means "not sent".
const retired = (args) => call('analyze_repo_structure', { rootPath: '$PARENT', ...args });
add('survey', 'analyze-repo-structure-retired-parts', { vault: 'miniature-repo' }, [
  retired({ view: 'analysis' }),
  retired({ view: 'analysis', ignore: ['src/billing'] }),
  retired({ proposal: {} }),
  retired({ proposal: { concepts: [] } }),
  retired({ qualification: { scenario: 'x' } }),
  retired({ proposal: {}, qualification: {} }),
  retired({ proposal: null }),
  retired({ qualification: null }),
  retired({ view: 'nonsense', proposal: {} }),
  retired({ maxDepth: 99, view: 'analysis' }),
  retired({ sourceOnly: true, proposal: {} }),
]);
add('survey', 'index-project-retired', { vault: 'miniature-repo' }, [call('index_project', { rootPath: '$PARENT' })]);

// ---------------------------------------------------------------------------------------------
// meaning: validate_vault
// ---------------------------------------------------------------------------------------------

for (const vault of ['storefront', 'edge-names', 'edge-bytes', 'edge-hostile', 'library', 'miniature-repo', 'hostile-git', 'empty', 'one-node']) {
  add('meaning', `validate-vault-${vault}`, { vault }, [
    call('validate_vault', {}),
    call('validate_vault', { limit: 1 }),
    call('validate_vault', { limit: 5, offset: 2 }),
    call('validate_vault', { offset: 99999 }),
    call('validate_vault', { limit: 0 }),
    call('validate_vault', { limit: 1000 }),
  ]);
}
add('meaning', 'validate-vault-atlas-ontology', { vault: 'atlas-ontology' }, [
  call('validate_vault', {}),
  call('validate_vault', { limit: 10, offset: 10 }),
]);
add('meaning', 'validate-vault-after-write', { vault: 'storefront' }, [
  call('validate_vault', { limit: 5 }),
  call('add_concepts', { concepts: [{ slug: 'capabilities/gift-wrap', kind: 'capability', title: 'Gift Wrap', domain: 'domains/order', body: 'Wraps an order as a gift.' }] }),
  call('validate_vault', { limit: 5 }),
]);
add('meaning', 'validate-wiki-in-validate-vault-library', { vault: 'library' }, [call('validate_vault', {}), call('validate_vault', { repoRoot: '$VAULT' })]);

// ---------------------------------------------------------------------------------------------
// writes: the nine writers, each answer and the bytes left on disk
// ---------------------------------------------------------------------------------------------

add('writes', 'add-concepts-single', { vault: 'storefront' }, [
  call('add_concepts', { concepts: [{ slug: 'capabilities/gift-wrap', kind: 'capability', title: 'Gift Wrap', domain: 'domains/order', body: 'Wraps an order as a gift.' }] }),
  call('get_concepts', { slugs: ['capabilities/gift-wrap'], body: 'full' }),
  call('add_concepts', { concepts: [{ slug: 'capabilities/gift-wrap', kind: 'capability', title: 'Gift Wrap', domain: 'domains/order' }] }),
  call('list_concepts', { kind: 'capability', summary: true, limit: 500 }),
]);
add('writes', 'add-concepts-batch-with-invalid-rows', { vault: 'storefront' }, [
  call('add_concepts', {
    concepts: [
      { slug: 'elements/gift-card', kind: 'element', title: 'Gift Card', domain: 'domains/payment' },
      { slug: 'capabilities/bad kind', kind: 'nonsense', title: 'Bad' },
      { slug: 'capabilities/../escape', kind: 'capability', title: 'Escape' },
      { slug: 'capabilities/nul\u0000byte', kind: 'capability', title: 'Nul' },
      { slug: '/absolute/path', kind: 'capability', title: 'Absolute' },
      { slug: 'capabilities/no-title', kind: 'capability' },
      { slug: 'domains/new-domain', kind: 'domain', title: 'New Domain', capabilities: ['capabilities/gift-wrap'] },
      { slug: 'document/readme', kind: 'document', title: 'Readme' },
    ],
  }),
  call('validate_vault', { limit: 3 }),
]);
add('writes', 'add-concepts-hangul-and-emoji', { vault: 'edge-names' }, [
  call('add_concepts', { concepts: [
    { slug: 'capabilities/\ud658\ubd88-\ucc98\ub9ac', kind: 'capability', title: '\ud658\ubd88 \ucc98\ub9ac', domain: 'domains/\uacb0\uc81c', body: '\ud658\ubd88\uc744 \ucc98\ub9ac\ud55c\ub2e4.', labels: { en: 'Refund', ko: '\ud658\ubd88' } },
    { slug: 'capabilities/😀-react', kind: 'capability', title: '😀 React', domain: 'domains/😀-smile' },
    { slug: 'capabilities/Éclair-2', kind: 'capability', title: 'Éclair'.normalize('NFD'), domain: 'domains/apple' },
    { slug: `capabilities/${'\uac00'.repeat(120)}`, kind: 'capability', title: '\uae34 \uc774\ub984', domain: 'domains/\uacb0\uc81c' },
  ] }),
  call('list_concepts', { kind: 'capability', summary: true }),
  call('list_concepts', { filter: 'title=\ud658\ubd88 \ucc98\ub9ac' }),
]);
add('writes', 'add-concepts-with-labels-extra-and-body-shapes', { vault: 'storefront' }, [
  call('add_concepts', { concepts: [
    { slug: 'capabilities/crlf-body', kind: 'capability', title: 'Crlf Body', domain: 'domains/order', body: 'line one\r\nline two\r\n\r\n## Includes\r\n- `a`\r\n' },
    { slug: 'capabilities/trailing-spaces', kind: 'capability', title: 'Trailing Spaces', domain: 'domains/order', body: 'text   \n\n\n\nmany blank lines\n' },
    { slug: 'capabilities/quote-and-colon', kind: 'capability', title: 'Title: with "quotes" and # hash', domain: 'domains/order', body: 'x' },
    { slug: 'capabilities/numberish', kind: 'capability', title: '12345', domain: 'domains/order' },
    { slug: 'capabilities/boolish', kind: 'capability', title: 'true', domain: 'domains/order' },
    { slug: 'capabilities/nullish', kind: 'capability', title: 'null', domain: 'domains/order' },
    { slug: 'capabilities/yaml-special', kind: 'capability', title: '- starts with dash', domain: 'domains/order' },
    { slug: 'capabilities/unicode-body', kind: 'capability', title: 'Unicode Body', domain: 'domains/order', body: 'A\u2028B \u00a0 \u3000 😀 \u200b done' },
    { slug: 'capabilities/long-line', kind: 'capability', title: 'Long Line', domain: 'domains/order', body: 'word '.repeat(4000) },
  ] }),
  call('get_concepts', { slugs: ['capabilities/crlf-body', 'capabilities/numberish', 'capabilities/boolish', 'capabilities/nullish'], body: 'full' }),
]);
add('writes', 'add-concepts-existing-uid-and-deep-slug', { vault: 'storefront' }, [
  call('add_concepts', { concepts: [{ slug: 'capabilities/deep/er/than/flat', kind: 'capability', title: 'Deep', domain: 'domains/order' }] }),
  call('add_concepts', { concepts: [{ slug: 'capabilities/Cart', kind: 'capability', title: 'Case Variant Of Cart', domain: 'domains/order' }] }),
  call('add_concepts', { concepts: [{ slug: 'capabilities/cart.md', kind: 'capability', title: 'Extension', domain: 'domains/order' }] }),
  call('add_concepts', { concepts: [] }),
  call('add_concepts', { concepts: Array.from({ length: 501 }, (_, i) => ({ slug: `elements/bulk-${i}`, kind: 'element', title: `Bulk ${i}` })) }),
]);
add('writes', 'add-concepts-into-empty-vault', { vault: 'empty' }, [
  call('add_concepts', { concepts: [{ slug: 'first', kind: 'project', title: 'First Project', domains: ['domains/first'] }, { slug: 'domains/first', kind: 'domain', title: 'First Domain' }] }),
  call('list_concepts', {}),
  call('compile_ontology', { summary: true }),
]);
add('writes', 'add-relations-and-remove', { vault: 'storefront' }, [
  call('add_relations', { relations: [{ from: 'capabilities/cart', to: 'capabilities/order-cancel', type: 'depends_on', why: 'a cart is cancelled through the order flow' }] }),
  call('add_relations', { relations: [{ from: 'capabilities/cart', to: 'capabilities/order-cancel', type: 'depends_on', why: 'again' }] }),
  call('add_relations', { relations: [{ from: 'capabilities/cart', to: 'capabilities/checkout', type: 'depends_on' }] }),
  call('add_relations', { relations: [{ from: 'capabilities/cart', to: 'capabilities/nonexistent', type: 'depends_on', why: 'x' }] }),
  call('add_relations', { relations: [{ from: 'capabilities/cart', to: 'capabilities/checkout', type: 'nonsense' }] }),
  call('add_relations', { relations: [{ from: 'capabilities/cart', to: 'capabilities/checkout', type: 'relates', why: 'x', expected_mtime: 5 }] }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'excerpt' }, { as: 'cart-read' }),
  call('add_relations', { relations: [{ from: 'capabilities/cart', to: 'capabilities/checkout', type: 'relates', why: 'x', expected_mtime: answerOf('cart-read', 'result.structuredContent.concepts[0].mtime') }] }),
  call('remove_relation', { from: 'capabilities/cart', to: 'capabilities/order-cancel', type: 'depends_on' }),
  call('remove_relation', { from: 'capabilities/cart', to: 'capabilities/order-cancel', type: 'depends_on', confirm: true }),
  call('remove_relation', { from: 'capabilities/cart', to: 'capabilities/order-cancel', type: 'depends_on', confirm: true }),
  call('remove_relation', { from: 'capabilities/cart', to: 'capabilities/checkout', type: 'relates', confirm: true, expected_mtime: 5 }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'excerpt' }, { as: 'cart-read-again' }),
  call('remove_relation', { from: 'capabilities/cart', to: 'capabilities/checkout', type: 'relates', confirm: true, expected_mtime: answerOf('cart-read-again', 'result.structuredContent.concepts[0].mtime') }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'excerpt' }),
]);
add('writes', 'replace-relation', { vault: 'storefront' }, [
  call('get_concepts', { slugs: ['capabilities/checkout'], body: 'excerpt' }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on', replaceWith: { to: 'capabilities/order-lookup', type: 'depends_on', why: 'swapped' } }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on', replaceWith: { to: 'capabilities/order-lookup', type: 'depends_on', why: 'swapped' }, confirm: true }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on', replaceWith: { to: 'capabilities/order-lookup', type: 'depends_on', why: 'swapped' }, confirm: true, expected_mtime: 7 }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/nonexistent', type: 'depends_on', replaceWith: { to: 'capabilities/order-lookup', type: 'depends_on', why: 'x' }, confirm: true }),
  call('get_concepts', { slugs: ['capabilities/checkout'], body: 'excerpt' }, { as: 'checkout-read' }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/order-lookup', type: 'depends_on', replaceWith: { to: 'capabilities/cart', type: 'relates', why: 'back' }, confirm: true, expected_mtime: answerOf('checkout-read', 'result.structuredContent.concepts[0].mtime') }),
  call('get_concepts', { slugs: ['capabilities/checkout'], body: 'excerpt' }),
]);
add('writes', 'patch-concept-frontmatter-and-body', { vault: 'storefront' }, [
  call('patch_concept', { slug: 'capabilities/cart', body: 'A new body.', expected_mtime: mtimeOf('capabilities/cart.md') }, { as: 'first-patch' }),
  call('patch_concept', { slug: 'capabilities/cart', body: 'A stale body.', expected_mtime: 5 }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { review_note: 'looked at it', domain: 'domains/payment' }, expected_mtime: answerOf('first-patch', 'result.structuredContent.mtime') }, { as: 'second-patch' }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { review_note: null, newkey: 'v', another: 2, list: ['a', 'b'] }, expected_mtime: answerOf('second-patch', 'result.structuredContent.mtime') }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { title: 'Cart, Renamed: "quoted" # x' } }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { uid: '00000000-0000-4000-8000-000000000000' } }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { slug: 'capabilities/other' } }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { kind: 'element' } }),
  call('patch_concept', { slug: 'capabilities/cart' }),
  call('patch_concept', { slug: 'capabilities/nonexistent', body: 'x' }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { weight: 0.125, tie: 2.5, big: 1e21, small: 5e-7, neg: -0, long: 0.1234567890123456789, whole: 3.0 } }),
  call('patch_concept', { slug: 'capabilities/cart', frontmatter: { __proto__x: 'y', constructor: 'c', 10: 'ten', 2: 'two', b: 'letter' } }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'full' }),
]);
add('writes', 'patch-concept-batch', { vault: 'storefront' }, [
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'Batch body.', expected_mtime: mtimeOf('capabilities/cart.md') }, { slug: 'capabilities/checkout', frontmatter: { review_note: 'batched' } }], confirm: false }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'Batch body.', expected_mtime: mtimeOf('capabilities/cart.md') }, { slug: 'capabilities/checkout', frontmatter: { review_note: 'batched' } }] }),
  call('get_concepts', { slugs: ['capabilities/cart', 'capabilities/checkout'], body: 'full' }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'Never written.' }, { slug: 'capabilities/checkout', body: 'Stale.', expected_mtime: 5 }] }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'Never written.' }, { slug: 'capabilities/nonexistent', body: 'x' }] }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'a' }, { slug: 'capabilities/cart', body: 'b' }] }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart' }] }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'x', extra: 1 }] }),
  call('patch_concept', { patches: [] }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'x' }], slug: 'capabilities/cart' }),
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', frontmatter: { uid: 'x' } }] }),
  call('get_concepts', { slugs: ['capabilities/cart', 'capabilities/checkout'], body: 'full' }),
]);
add('safety', 'audit-lines-for-a-loose-name', { vault: 'loose-names' }, [
  call('remove_relation', { from: 'a', to: 'b', type: 'depends_on', confirm: true }),
  call('delete_concept', { slug: 'Domains/C', confirm: true }),
]);
add('safety', 'audit-lines-for-a-loose-name-in-every-writer', { vault: 'loose-names' }, [
  call('remove_relation', { from: 'a', to: 'b', type: 'depends_on', replaceWith: { to: 'c', type: 'depends_on', why: 'swapped' }, confirm: true }),
  call('rename_concept', { oldSlug: 'Domains/C', newSlug: 'domains/e', confirm: true }),
  call('rename_concept', { oldSlug: 'B', newKind: 'capability', domain: 'domains/a', newSlug: 'capabilities/b', confirm: true }),
  call('add_relation', { from: 'A', to: 'DOMAINS/E', type: 'relates' }),
]);
add('safety', 'write-edits-a-windows-device-named-file', { vault: 'storefront' }, [
  { $: 'write-file', path: 'elements/aux.md', text: '---\nuid: 5c0a0000-0000-4000-8000-000000000001\nslug: elements/aux\nkind: element\ntitle: Aux\ndomain: domains/order\ndepends_on: [capabilities/cart]\nrelation_notes:\n  capabilities/cart: reads the cart\n---\n\nAn element that was named for a device before the rule.\n' },
  { $: 'write-file', path: 'elements/con.md', text: '---\nuid: 5c0a0000-0000-4000-8000-000000000002\nslug: elements/con\nkind: element\ntitle: Con\ndomain: domains/order\n---\n\nAnother one.\n' },
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/basket', confirm: true }),
  call('rename_concept', { oldSlug: 'elements/aux', newSlug: 'elements/port', confirm: true }),
  call('delete_concept', { slug: 'elements/con', confirm: true }),
  call('get_concepts', { slugs: ['elements/port'], body: 'full' }),
]);
add('safety', 'write-with-consent-card-names-what-the-handler-writes', { vault: 'storefront', env: { OATLAS_WRITE_CONSENT: 'true' }, capabilities: { elicitation: { form: {} } }, elicit: 'decline' }, [
  call('rename_concept', { oldSlug: 'capabilities/faq', newKind: 'domain', domain: 'domains/order', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/faq', newKind: 'domain', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/faq', newKind: 'element', domain: 'domains/order', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/faq', newSlug: 'capabilities/cart', overwrite: true, confirm: true }),
]);
add('safety', 'rename-over-an-existing-file-keeps-the-more-private-mode', { vault: 'storefront' }, [
  { $: 'write-file', path: 'capabilities/checkout.md', text: '---\nuid: 5c0a0000-0000-4000-8000-000000000003\nslug: capabilities/checkout\nkind: capability\ntitle: Checkout\ndomain: domains/order\n---\n\nOpen.\n' },
  { $: 'chmod', path: 'capabilities/checkout.md', mode: 0o644 },
  { $: 'chmod', path: 'capabilities/cart.md', mode: 0o600 },
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/checkout', confirm: true, overwrite: true }),
]);
add('library', 'absorb-document-below-a-guessed-root', { vault: 'library' }, [
  { $: 'write-file', path: '../.claude/CLAUDE.md', text: '# Rules\n\nSome prose about annotating.\n' },
  call('absorb_document', { filePath: '$PARENT/.claude/CLAUDE.md' }),
  call('absorb_document', { filePath: '$PARENT/.claude/CLAUDE.md', confirm: true }),
]);
add('safety', 'write-refused-by-a-reserved-referrer', { vault: 'reserved-referrer' }, [
  call('rename_concept', { oldSlug: 'capabilities/target', newSlug: 'capabilities/goal', confirm: true }),
  call('merge_concepts', { fromSlug: 'capabilities/target', intoSlug: 'capabilities/other', confirm: true }),
  call('get_concepts', { slugs: ['capabilities/target'] }),
]);
add('writes', 'patch-concept-batch-names-one-node-twice', { vault: 'storefront' }, [
  call('patch_concept', { patches: [{ slug: 'capabilities/cart', body: 'First.' }, { slug: 'Capabilities/Cart', body: 'Second.' }] }),
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'full' }),
]);
add('writes', 'patch-concept-preserves-bytes-of-odd-files', { vault: 'edge-bytes' }, [
  call('patch_concept', { slug: 'capabilities/crlf', frontmatter: { note: 'edited' }, expected_mtime: mtimeOf('capabilities/crlf.md') }),
  call('patch_concept', { slug: 'capabilities/bom', frontmatter: { note: 'edited' }, expected_mtime: mtimeOf('capabilities/bom.md') }),
  call('patch_concept', { slug: 'capabilities/numbers', body: 'body only', expected_mtime: mtimeOf('capabilities/numbers.md') }),
  call('patch_concept', { slug: 'capabilities/prototype-keys', frontmatter: { added: 1 }, expected_mtime: mtimeOf('capabilities/prototype-keys.md') }),
  call('patch_concept', { slug: 'capabilities/no-final-newline', body: 'now has body', expected_mtime: mtimeOf('capabilities/no-final-newline.md') }),
  call('patch_concept', { slug: 'capabilities/unicode-separators', frontmatter: { note: 'x' }, expected_mtime: mtimeOf('capabilities/unicode-separators.md') }),
  call('patch_concept', { slug: 'invalid-utf8', body: 'x' }),
  call('patch_concept', { slug: 'duplicate-keys', frontmatter: { title: 'Third' } }),
  call('patch_concept', { slug: 'empty-file', body: 'x' }),
  call('patch_concept', { slug: 'capabilities/nul-byte', body: 'x' }),
]);
add('writes', 'rename-concept', { vault: 'storefront' }, [
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/basket' }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/basket', confirm: true, expected_mtime: 5 }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/basket', confirm: true, expected_mtime: mtimeOf('capabilities/cart.md') }),
  call('rename_concept', { oldSlug: 'capabilities/basket', newSlug: 'capabilities/checkout', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/basket', newSlug: 'capabilities/checkout', confirm: true, overwrite: true }),
  call('rename_concept', { oldSlug: 'capabilities/nonexistent', newSlug: 'capabilities/x', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/order-cancel', newSlug: '../escape', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/order-cancel', newSlug: 'capabilities/\uc8fc\ubb38-\ucde8\uc18c', confirm: true }),
  call('find_backlinks', { slug: 'capabilities/basket' }),
  call('validate_vault', { limit: 3 }),
]);
add('writes', 'rename-concept-hangul-and-normalization', { vault: 'edge-names' }, [
  call('rename_concept', { oldSlug: 'capabilities/\uc8fc\ubb38-\ucde8\uc18c', newSlug: 'capabilities/\uc8fc\ubb38-\ucca0\ud68c', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/Éclair', newSlug: 'capabilities/Éclair'.normalize('NFD'), confirm: true }),
  call('rename_concept', { oldSlug: 'domains/\uc6d0\uc7a5'.normalize('NFD'), newSlug: 'domains/\uc6d0\uc7a5-new', confirm: true }),
  call('find_backlinks', { slug: 'capabilities/cancel-order' }),
  call('list_concepts', { summary: true }),
]);
add('writes', 'reclassify-concept', { vault: 'storefront' }, [
  call('rename_concept', { oldSlug: 'capabilities/cart', newKind: 'element' }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newKind: 'element', confirm: true, expected_mtime: 5 }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newKind: 'element', confirm: true, expected_mtime: mtimeOf('capabilities/cart.md') }),
  call('rename_concept', { oldSlug: 'elements/cart', newKind: 'capability', newSlug: 'capabilities/cart-again', domain: 'domains/order', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/checkout', newKind: 'nonsense', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/checkout', newKind: 'domain', domain: null, body: 'now a domain', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/nonexistent', newKind: 'element', confirm: true }),
  call('validate_vault', { limit: 3 }),
]);
add('writes', 'merge-concepts', { vault: 'storefront' }, [
  call('merge_concepts', { fromSlug: 'capabilities/order-cancel', intoSlug: 'capabilities/order-partial-cancel' }),
  call('merge_concepts', { fromSlug: 'capabilities/order-cancel', intoSlug: 'capabilities/order-partial-cancel', confirm: true, expected_mtime: 5 }),
  call('merge_concepts', { fromSlug: 'capabilities/order-cancel', intoSlug: 'capabilities/order-partial-cancel', confirm: true, expected_mtime: mtimeOf('capabilities/order-cancel.md'), expected_into_mtime: 5 }),
  call('merge_concepts', { fromSlug: 'capabilities/order-cancel', intoSlug: 'capabilities/order-partial-cancel', confirm: true, expected_mtime: mtimeOf('capabilities/order-cancel.md'), expected_into_mtime: mtimeOf('capabilities/order-partial-cancel.md') }),
  call('merge_concepts', { fromSlug: 'capabilities/cart', intoSlug: 'capabilities/cart', confirm: true }),
  call('merge_concepts', { fromSlug: 'capabilities/nonexistent', intoSlug: 'capabilities/cart', confirm: true }),
  call('find_backlinks', { slug: 'capabilities/order-partial-cancel' }),
]);
add('writes', 'delete-concept', { vault: 'storefront' }, [
  call('delete_concept', { slug: 'capabilities/faq' }),
  call('delete_concept', { slug: 'capabilities/faq', confirm: true, expected_mtime: 5 }),
  call('delete_concept', { slug: 'capabilities/faq', confirm: true, expected_mtime: mtimeOf('capabilities/faq.md') }),
  call('delete_concept', { slug: 'capabilities/cart', confirm: true }),
  call('delete_concept', { slug: 'capabilities/cart', confirm: true, force: true }),
  call('delete_concept', { slug: 'capabilities/nonexistent', confirm: true }),
  call('delete_concept', { slug: '../outside', confirm: true, force: true }),
  call('validate_vault', { limit: 3 }),
]);
add('writes', 'write-then-read-same-session', { vault: 'storefront' }, [
  call('list_concepts', { limit: 1 }),
  call('add_concepts', { concepts: [{ slug: 'capabilities/live-chat', kind: 'capability', title: 'Live Chat', domain: 'domains/support' }] }),
  call('list_concepts', { kind: 'capability', summary: true, limit: 500 }),
  call('query_ontology', { operation: 'overview' }),
  call('get_concepts', { slugs: ['capabilities/live-chat'], body: 'excerpt' }, { as: 'chat-read' }),
  call('patch_concept', { slug: 'capabilities/live-chat', body: 'Chat with support.', expected_mtime: answerOf('chat-read', 'result.structuredContent.concepts[0].mtime') }),
  call('get_concepts', { slugs: ['capabilities/live-chat'], body: 'full' }, { as: 'chat-read-after-patch' }),
  call('delete_concept', { slug: 'capabilities/live-chat', confirm: true, expected_mtime: answerOf('chat-read-after-patch', 'result.structuredContent.concepts[0].mtime') }),
  call('list_concepts', { kind: 'capability', summary: true, limit: 3 }),
]);
add('writes', 'writes-on-miniature-repo-evidence-nodes', { vault: 'miniature-repo' }, [
  call('patch_concept', { slug: 'capabilities/charge-card', body: 'Charges a card. See `charge`.', expected_mtime: mtimeOf('capabilities/charge-card.md') }),
  call('add_concepts', { concepts: [{ slug: 'capabilities/send-invoice', kind: 'capability', title: 'Send Invoice', domain: 'domains/payment', path: 'src/billing/invoice.py', body: 'Issues an invoice.' }] }),
  call('add_concepts', { concepts: [{ slug: 'capabilities/bad-path', kind: 'capability', title: 'Bad Path', domain: 'domains/payment', path: '../outside' }] }),
  call('validate_vault', {}),
]);
add('writes', 'write-then-compile-reports-activity-side-files', { vault: 'storefront' }, [
  call('add_concepts', { concepts: [{ slug: 'elements/side-file-probe', kind: 'element', title: 'Side File Probe' }] }),
  call('add_concepts', { concepts: [{ slug: 'elements/side-file-probe-2', kind: 'element', title: 'Side File Probe Two' }] }),
  call('patch_concept', { slug: 'elements/side-file-probe', body: 'x' }),
  call('query_ontology', { operation: 'overview' }),
]);

// ---------------------------------------------------------------------------------------------
// library: constellations, wiki, absorb, project source
// ---------------------------------------------------------------------------------------------

add('library', 'constellations', { vault: 'library' }, [
  call('get_constellation', {}),
  call('get_constellation', { limit: 1 }),
  call('get_constellation', { offset: 1 }),
  call('get_constellation', { offset: 99 }),
  call('get_constellation', { id: '1f6c0b1a-8f2e-4c3a-9d5e-000000000001' }),
  call('get_constellation', { id: 'not-a-uuid' }),
  call('get_constellation', { id: '00000000-0000-4000-8000-000000000000' }),
]);
add('library', 'constellations-in-vaults-without-a-collection-file', { vault: 'storefront' }, [
  call('get_constellation', {}),
  call('get_constellation', { id: '00000000-0000-4000-8000-000000000000' }),
]);
add('library', 'wiki-validation', { vault: 'library' }, [
  call('validate_wiki', {}),
  call('validate_wiki', { paths: ['wiki/plan.md'] }),
  call('validate_wiki', { paths: ['wiki/plan.md', 'wiki/broken.md', 'wiki/plain.md', 'wiki/missing.md'] }),
  call('validate_wiki', { paths: ['../outside/absorb-me.md'] }),
  call('validate_wiki', { paths: ['/etc/hosts'] }),
  call('validate_wiki', { limit: 1 }),
  call('validate_wiki', { limit: 1, offset: 1 }),
  call('validate_wiki', { afterPath: 'wiki/broken.md' }),
  call('validate_wiki', { paths: [] }),
]);
add('library', 'wiki-validation-without-a-wiki-folder', { vault: 'storefront' }, [call('validate_wiki', {}), call('validate_wiki', { paths: ['wiki/x.md'] })]);
add('library', 'wiki-validation-stale-source', { vault: 'library' }, [
  call('validate_wiki', {}),
  { $: 'write-file', path: 'sources/notes.md', text: '# Source notes\n\nChanged after the page was compiled.\n' },
  call('validate_wiki', {}),
  call('validate_wiki', { paths: ['wiki/plan.md'] }),
]);
add('library', 'absorb-document', { vault: 'library' }, [
  call('absorb_document', { filePath: '$PARENT/outside/absorb-me.md' }),
  call('absorb_document', { filePath: '$PARENT/outside/absorb-me.md', confirm: true }),
  call('absorb_document', { filePath: '$PARENT/outside/absorb-me.md', allowOutsideRepo: true }),
  call('absorb_document', { filePath: '$PARENT/outside/absorb-me.md', allowOutsideRepo: true, confirm: true }),
  call('absorb_document', { filePath: 'wiki/plan.md' }),
  call('absorb_document', { filePath: '$VAULT/wiki/plan.md', confirm: true }),
  call('absorb_document', { filePath: '$VAULT/nonexistent.md', confirm: true }),
  call('absorb_document', { filePath: '/etc/hosts', allowOutsideRepo: true }),
  call('absorb_document', { filePath: '' }),
  call('absorb_document', { filePath: '$VAULT/sources/data.csv', confirm: true }),
]);
add('library', 'absorb-document-folders', { vault: 'library', env: { OATLAS_REPO_ROOT: '$VAULT' } }, [
  { $: 'write-file', path: '../outside/.ssh/notes.md', text: '# Notes\n\nSome prose about annotating.\n' },
  { $: 'write-file', path: '../outside/secrets/notes.md', text: '# Notes\n\nSome prose about annotating.\n' },
  { $: 'write-file', path: '.github/AGENTS.md', text: '# Rules\n\nSome prose about annotating.\n' },
  call('absorb_document', { filePath: '$PARENT/outside/.ssh/notes.md', allowOutsideRepo: true }),
  call('absorb_document', { filePath: '$PARENT/outside/secrets/notes.md', allowOutsideRepo: true }),
  call('absorb_document', { filePath: '$PARENT/outside/.ssh/notes.md', allowOutsideRepo: true, confirm: true }),
  call('absorb_document', { filePath: '$VAULT/.github/AGENTS.md' }),
  call('absorb_document', { filePath: '$VAULT/.github/AGENTS.md', confirm: true }),
]);
add('library', 'absorb-document-hostile-paths', { vault: 'edge-hostile' }, [
  call('absorb_document', { filePath: '$VAULT/escape-file.md', confirm: true }),
  call('absorb_document', { filePath: '$VAULT/escape-file.md', allowOutsideRepo: true, confirm: true }),
  call('absorb_document', { filePath: '$VAULT/.env', allowOutsideRepo: true, confirm: true }),
  call('absorb_document', { filePath: '$VAULT/credentials.json', allowOutsideRepo: true }),
  call('absorb_document', { filePath: '$VAULT/oversized.md', confirm: true }),
  call('absorb_document', { filePath: '$VAULT/../outside/secret.md' }),
]);
add('library', 'project-source-connect-and-disconnect', { vault: 'miniature-repo' }, [
  call('connect_project_source', { projectSlug: 'miniature-shop' }),
  call('connect_project_source', { projectSlug: 'miniature-shop', rootPath: '$PARENT' }),
  call('connect_project_source', { projectSlug: 'miniature-shop', rootPath: '$PARENT', confirm: true }),
  call('get_concepts', { slugs: ['miniature-shop'], body: 'excerpt' }),
  call('connect_project_source', { projectSlug: 'miniature-shop', rootPath: '$PARENT', confirm: true }),
  call('connect_project_source', { projectSlug: 'miniature-shop', rootPath: '$PARENT', repair: true, confirm: true }),
  call('validate_vault', { limit: 3 }),
  call('disconnect_project_source', { projectSlug: 'miniature-shop' }),
  call('disconnect_project_source', { projectSlug: 'miniature-shop', confirm: true }),
  call('disconnect_project_source', { projectSlug: 'miniature-shop', confirm: true }),
  call('connect_project_source', { projectSlug: 'nonexistent', rootPath: '$PARENT' }),
  call('connect_project_source', { projectSlug: 'domains/order', rootPath: '$PARENT' }),
  call('connect_project_source', { projectSlug: 'miniature-shop', rootPath: '$PARENT/does-not-exist', confirm: true }),
]);
// The vault itself comes first: a probe of the vault reads the size and time of every file in it, so
// once a connect has written the binding file the probe would hold a time no second run can repeat.
add('library', 'project-source-connect-hostile-roots', { vault: 'edge-hostile', revisionsDependOnPlace: true }, [
  call('connect_project_source', { projectSlug: 'hostile', rootPath: '$VAULT', confirm: true }),
  call('connect_project_source', { projectSlug: 'hostile', rootPath: '$PARENT/outside', confirm: true }),
  call('connect_project_source', { projectSlug: 'hostile', rootPath: '/etc', confirm: true }),
  call('connect_project_source', { projectSlug: 'hostile', rootPath: '$VAULT/escape-dir', confirm: true }),
]);
add('library', 'finalize-project-meaning', { vault: 'miniature-repo' }, [
  call('finalize_project_meaning', { projectSlug: 'miniature-shop', expected_mtime: mtimeOf('miniature-shop.md') }),
  call('finalize_project_meaning', { projectSlug: 'miniature-shop', expected_mtime: 5 }),
  call('finalize_project_meaning', {
    projectSlug: 'miniature-shop',
    expected_mtime: mtimeOf('miniature-shop.md'),
    answers: ['scope', 'domains', 'abilities', 'evidence', 'impact'].map((id) => ({ id, status: 'visible-gap', gap: `not yet answered: ${id}` })),
  }),
  call('finalize_project_meaning', {
    projectSlug: 'miniature-shop',
    expected_mtime: mtimeOf('miniature-shop.md'),
    answers: [
      { id: 'scope', status: 'answered', answer: 'A small shop.', concepts: ['miniature-shop'] },
      { id: 'domains', status: 'partial', answer: 'Order and payment.', gap: 'shipping is missing' },
      { id: 'abilities', status: 'visible-gap', gap: 'none read' },
      { id: 'evidence', status: 'visible-gap', gap: 'none read' },
      { id: 'impact', status: 'visible-gap', gap: 'none read' },
    ],
  }),
  call('finalize_project_meaning', { projectSlug: 'nonexistent', expected_mtime: 5 }),
  call('get_concepts', { slugs: ['miniature-shop'], body: 'excerpt' }),
]);
// With a connected source folder the answers are judged against measured evidence: the gate that
// `validate_vault` reports, the witnesses each row may cite, and the receipt a finalize writes.
const SHOP_ANSWERS = [
  { id: 'scope', status: 'answered', answer: 'A small shop that places, cancels and charges orders.', concepts: ['miniature-shop'] },
  { id: 'domains', status: 'answered', answer: 'Order and payment.', concepts: ['domains/order', 'domains/payment'] },
  { id: 'abilities', status: 'answered', answer: 'Placing, cancelling and charging.', concepts: ['capabilities/place-order', 'capabilities/cancel-order', 'capabilities/charge-card'] },
  { id: 'evidence', status: 'partial', answer: 'Placing an order is cited.', concepts: ['capabilities/place-order'], gap: 'cancelling and charging are not cited' },
  { id: 'impact', status: 'visible-gap', gap: 'no impact read' },
];
add('library', 'finalize-project-meaning-with-source', { vault: 'miniature-repo' }, [
  call('connect_project_source', { projectSlug: 'miniature-shop', rootPath: '$PARENT', confirm: true }),
  call('get_concepts', { slugs: ['miniature-shop'], body: 'excerpt' }, { as: 'shop' }),
  call('finalize_project_meaning', { projectSlug: 'miniature-shop', expected_mtime: answerOf('shop', 'result.structuredContent.concepts[0].mtime') }),
  call('finalize_project_meaning', {
    projectSlug: 'miniature-shop',
    expected_mtime: answerOf('shop', 'result.structuredContent.concepts[0].mtime'),
    answers: SHOP_ANSWERS,
  }),
  call('get_concepts', { slugs: ['miniature-shop'], body: 'full' }, { as: 'shop-after' }),
  call('finalize_project_meaning', {
    projectSlug: 'miniature-shop',
    expected_mtime: answerOf('shop-after', 'result.structuredContent.concepts[0].mtime'),
    answers: SHOP_ANSWERS.map((row) => ({ id: row.id, status: 'visible-gap', gap: `still open: ${row.id}` })),
  }),
]);
add('library', 'finalize-project-meaning-after-reads', { vault: 'miniature-repo' }, [
  call('connect_project_source', { projectSlug: 'miniature-shop', rootPath: '$PARENT', confirm: true }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceOnly: true, sourceReads: [{ path: 'src/order/placement.ts', symbol: 'placeOrder' }, { path: 'src/payment/charge.ts', startLine: 1, maxLines: 4 }] }),
  call('validate_vault', {}),
  call('get_concepts', { slugs: ['miniature-shop'], body: 'excerpt' }, { as: 'shop' }),
  call('finalize_project_meaning', {
    projectSlug: 'miniature-shop',
    expected_mtime: answerOf('shop', 'result.structuredContent.concepts[0].mtime'),
    answers: SHOP_ANSWERS,
  }),
]);

// ---------------------------------------------------------------------------------------------
// safety: hostile inputs, refused exactly as today, with nothing read or written outside the vault
// ---------------------------------------------------------------------------------------------

const HOSTILE_SLUGS = [
  '../outside/secret', '..', '../', 'capabilities/../../outside/secret', '/etc/passwd', '/', 'C:\\Windows\\win.ini', '\\\\server\\share\\x',
  'capabilities/normal\u0000.md', 'capabilities/normal\u0000', '\u0000', 'capabilities/./normal', './capabilities/normal', 'capabilities//normal',
  'capabilities/normal/', 'capabilities\\normal', 'escape-file', 'escape-file.md', 'escape-dir/secret', 'escape-dir', 'absolute-link', 'loop-a',
  'inside-link', '.hidden/inside-hidden', '.env', '.git/config', '.ontology-atlas/activity', 'secrets', 'oversized', '%2e%2e/outside/secret',
  '..%2foutside%2fsecret', 'capabilities/normal%00', 'CAPABILITIES/NORMAL', ' capabilities/normal', 'capabilities/normal ', '~/secret', '$HOME/secret',
  'capabilities/normal\n', 'a'.repeat(5000), `${'deep/'.repeat(100)}x`, 'deep/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9',
];
add('safety', 'hostile-slugs-on-reads', { vault: 'edge-hostile' }, HOSTILE_SLUGS.flatMap((slug) => [
  call('get_concepts', { slugs: [slug], body: 'full' }),
  call('find_backlinks', { slug }),
]));
add('safety', 'hostile-slugs-on-writes', { vault: 'edge-hostile' }, [
  ...HOSTILE_SLUGS.map((slug) => call('add_concepts', { concepts: [{ slug, kind: 'element', title: 'Hostile' }] })),
  ...HOSTILE_SLUGS.map((slug) => call('patch_concept', { slug, body: 'x' })),
  ...HOSTILE_SLUGS.map((slug) => call('delete_concept', { slug, confirm: true, force: true })),
  ...HOSTILE_SLUGS.map((slug) => call('rename_concept', { oldSlug: 'capabilities/normal', newSlug: slug, confirm: true })),
  ...HOSTILE_SLUGS.map((slug) => call('rename_concept', { oldSlug: slug, newSlug: 'capabilities/renamed', confirm: true })),
  ...HOSTILE_SLUGS.slice(0, 12).map((slug) => call('rename_concept', { oldSlug: slug, newKind: 'element', confirm: true })),
  ...HOSTILE_SLUGS.slice(0, 12).map((slug) => call('merge_concepts', { fromSlug: slug, intoSlug: 'capabilities/normal', confirm: true })),
  ...HOSTILE_SLUGS.slice(0, 12).map((slug) => call('add_relations', { relations: [{ from: slug, to: 'capabilities/normal', type: 'relates', why: 'x' }] })),
  call('list_concepts', { summary: true }),
]);
add('safety', 'write-names-a-windows-device', { vault: 'storefront' }, [
  call('add_concepts', { concepts: [{ slug: 'elements/con', kind: 'element', title: 'Con' }] }),
  call('add_concepts', { concepts: [{ slug: 'nul', kind: 'document', title: 'Nul' }] }),
  call('add_concepts', { concepts: [{ slug: 'elements/aux.v2', kind: 'element', title: 'Aux' }] }),
  call('add_concepts', { concepts: [{ slug: 'elements/console', kind: 'element', title: 'Console' }] }),
  call('list_concepts', { limit: 1 }),
]);
add('safety', 'writes-through-symlinks', { vault: 'edge-hostile' }, [
  call('patch_concept', { slug: 'escape-file', body: 'overwritten through a link' }),
  call('patch_concept', { slug: 'inside-link', body: 'overwritten through an inside link' }),
  call('delete_concept', { slug: 'escape-file', confirm: true, force: true }),
  call('rename_concept', { oldSlug: 'escape-file', newSlug: 'capabilities/moved', confirm: true }),
  call('add_concepts', { concepts: [{ slug: 'escape-dir/created', kind: 'element', title: 'Created Through A Link' }] }),
  call('add_concepts', { concepts: [{ slug: 'escape-file', kind: 'element', title: 'Over A Link' }] }),
  call('get_concepts', { slugs: ['capabilities/moved', 'escape-dir/created'] }),
]);
add('safety', 'reads-skip-credential-and-hidden-names', { vault: 'edge-hostile' }, [
  call('list_concepts', {}),
  call('list_concepts', { summary: true }),
  call('compile_ontology', { summary: true }),
  call('list_concepts', { mentions: 'sentinel' }),
  call('list_concepts', { mentions: 'API_KEY' }),
  call('read_source', { path: '.env' }),
  call('read_source', { path: '.env.local' }),
  call('read_source', { path: 'credentials.json' }),
  call('read_source', { path: 'id_rsa' }),
  call('read_source', { path: 'service-account.json' }),
  call('read_source', { path: '.npmrc' }),
  call('read_source', { path: 'secrets.md' }),
  call('read_source', { path: '.hidden/inside-hidden.md' }),
  call('read_source', { path: '.git/config' }),
  call('read_source', { path: '../outside/data.txt' }),
  call('read_source', { path: '../outside/secret.md' }),
  call('read_source', { path: 'escape-file.md' }),
  call('read_source', { path: 'escape-dir/data.txt' }),
  call('read_source', { path: 'absolute-link.md' }),
  call('read_source', { path: '/etc/hosts' }),
  call('read_source', { path: '$VAULT/capabilities/normal.md' }),
  call('read_source', { path: '$PARENT/outside/data.txt' }),
  call('read_source', { path: 'oversized.md' }),
  call('read_source', { path: 'oversized.md', from: 1, limit: 1 }),
  call('read_source', { path: 'loop-a.md' }),
  call('read_source', { path: 'inside-link.md' }),
  call('read_source', { path: 'ignored/inside.md' }),
  call('read_source', { path: 'note.skip.md' }),
  call('read_source', { path: `deep/${Array.from({ length: 40 }, (_, i) => `level-${i}`).join('/')}/bottom.md` }),
]);
add('safety', 'scan-roots-outside-the-vault-and-repository', { vault: 'edge-hostile' }, [
  ...['analyze_repo_structure', 'infer_imports', 'inspect_architecture'].flatMap((tool) => [
    call(tool, { rootPath: '$PARENT/outside' }),
    call(tool, { rootPath: '$PARENT' }),
    call(tool, { rootPath: '/' }),
    call(tool, { rootPath: '/etc' }),
    call(tool, { rootPath: '..' }),
    call(tool, { rootPath: '$VAULT/..' }),
    call(tool, { rootPath: '$VAULT/escape-dir' }),
    call(tool, { rootPath: '$VAULT/escape-file.md' }),
    call(tool, { rootPath: '$VAULT/does-not-exist' }),
    call(tool, { rootPath: '' }),
    call(tool, { rootPath: '~' }),
    call(tool, { rootPath: '$VAULT/loop-a.md' }),
    call(tool, { rootPath: '$VAULT/.hidden' }),
    call(tool, { rootPath: '$VAULT' }),
  ]),
  call('analyze_repo_structure', { rootPath: '$VAULT', sourceReads: ['escape-file.md', '../outside/data.txt', '.env', 'credentials.json', 'oversized.md', 'loop-a.md'].map((file) => ({ path: file, mode: 'outline' })) }),
  call('validate_vault', { repoRoot: '$PARENT/outside' }),
  call('validate_vault', { repoRoot: '/etc' }),
]);
add('safety', 'scan-roots-with-a-separate-repository', { vault: 'miniature-repo', env: { OATLAS_REPO_ROOT: '$PARENT' } }, [
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT/..' }),
  call('infer_imports', { rootPath: '$PARENT/..' }),
  call('inspect_architecture', { rootPath: '$PARENT/src' }),
  call('read_source', { path: '.env' }),
  call('read_source', { path: '../.env' }),
  call('read_source', { path: '../../etc/hosts' }),
]);
add('safety', 'confined-source-reads-on', { vault: 'miniature-repo', env: { OATLAS_CONFINED_SOURCE_READS: '1' } }, [
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/placement.ts', symbol: 'placeOrder' }, { path: '.env', mode: 'outline' }, { path: '../outside', mode: 'outline' }, { path: '/etc/hosts', mode: 'outline' }] }),
  call('infer_imports', { rootPath: '$PARENT' }),
  call('inspect_architecture', { rootPath: '$PARENT' }),
  call('list_concepts', { mentions: 'Place Order' }),
  call('read_source', { path: 'src/order/placement.ts' }),
  call('read_source', { path: '.env' }),
  call('validate_vault', { limit: 3 }),
]);
add('safety', 'confined-source-reads-on-hostile-vault', { vault: 'edge-hostile', env: { OATLAS_CONFINED_SOURCE_READS: '1' } }, [
  call('analyze_repo_structure', { rootPath: '$VAULT' }),
  call('infer_imports', { rootPath: '$VAULT' }),
  call('read_source', { path: 'escape-file.md' }),
  call('read_source', { path: 'oversized.md' }),
  call('read_source', { path: 'loop-a.md' }),
]);
add('safety', 'confined-source-reads-with-a-bad-descriptor', { vault: 'miniature-repo', env: { OATLAS_CONFINED_SOURCE_READS: '1', OATLAS_SOURCE_SNAPSHOT_FD: '999' } }, [
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('read_source', { path: 'src/order/placement.ts' }),
]);
add('safety', 'snapshot-descriptor-not-a-number', { vault: 'miniature-repo', env: { OATLAS_SOURCE_SNAPSHOT_FD: 'abc' } }, [call('read_source', { path: 'src/order/placement.ts' })]);
add('safety', 'repository-whose-config-would-run-code', { vault: 'hostile-git', mustNotExist: ['fsmonitor-ran.txt', 'ssh-ran.txt', 'diff-ran.txt', 'filter-ran.txt', 'hook-ran.txt'] }, [
  call('validate_vault', {}),
  call('query_ontology', { operation: 'health' }),
  call('query_ontology', { operation: 'maintenance_plan' }),
  call('connection_info', {}),
  call('list_concepts', { summary: true }),
  call('get_concepts', { slugs: ['hostile-git', 'domains/inside'] }),
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('infer_imports', { rootPath: '$PARENT' }),
]);
add('safety', 'write-under-read-only-mode', { vault: 'storefront', env: { OATLAS_READ_ONLY: '1' } }, [
  call('add_concepts', { concepts: [{ slug: 'elements/nope', kind: 'element', title: 'Nope' }] }),
  call('patch_concept', { slug: 'capabilities/cart', body: 'nope' }),
  call('delete_concept', { slug: 'capabilities/cart', confirm: true, force: true }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/x', confirm: true }),
  call('absorb_document', { filePath: '$VAULT/storefront.md', confirm: true }),
  call('connect_project_source', { projectSlug: 'storefront', rootPath: '$VAULT', confirm: true }),
  call('finalize_project_meaning', { projectSlug: 'storefront', expected_mtime: 5 }),
  call('add_concepts', { concepts: [{ slug: 'elements/nope', kind: 'element', title: 'Nope' }], dryRun: true }),
  call('list_concepts', { limit: 1 }),
]);
add('safety', 'write-with-consent-on-and-no-way-to-ask', { vault: 'storefront', env: { OATLAS_WRITE_CONSENT: '1' } }, [
  call('add_concepts', { concepts: [{ slug: 'elements/asked', kind: 'element', title: 'Asked' }] }),
  call('patch_concept', { slug: 'capabilities/cart', body: 'asked' }),
  call('delete_concept', { slug: 'capabilities/faq', confirm: true }),
  call('delete_concept', { slug: 'capabilities/faq' }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/x' }),
  call('add_concepts', { concepts: [{ slug: 'elements/asked', kind: 'element', title: 'Asked' }], dryRun: true }),
  call('add_concepts', { concepts: [{ slug: 'elements/asked', kind: 'element', title: 'Asked' }], dry_run: true }),
  call('list_concepts', { limit: 1 }),
]);
for (const [label, answer] of [['accepted', 'accept'], ['declined', 'decline'], ['cancelled', 'cancel']]) {
  add('safety', `write-with-consent-${label}`, { vault: 'storefront', env: { OATLAS_WRITE_CONSENT: 'true' }, capabilities: { elicitation: { form: {} } }, elicit: answer }, [
    call('add_concepts', { concepts: [{ slug: 'elements/asked', kind: 'element', title: 'Asked' }] }),
    call('patch_concept', { slug: 'capabilities/cart', body: 'asked', expected_mtime: mtimeOf('capabilities/cart.md') }),
    call('delete_concept', { slug: 'capabilities/faq', confirm: true }),
    call('add_concepts', { concepts: [{ slug: 'elements/asked', kind: 'element', title: 'Asked' }], dryRun: true }),
    call('list_concepts', { limit: 1 }),
  ]);
}
add('safety', 'write-with-consent-replaced-relation', { vault: 'storefront', env: { OATLAS_WRITE_CONSENT: 'true' }, capabilities: { elicitation: { form: {} } }, elicit: 'accept' }, [
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on', replaceWith: { to: 'capabilities/order-lookup', type: 'depends_on', why: 'swapped' }, confirm: true }),
  call('list_concepts', { limit: 1 }),
]);
add('safety', 'write-with-consent-kind-change', { vault: 'storefront', env: { OATLAS_WRITE_CONSENT: 'true' }, capabilities: { elicitation: { form: {} } }, elicit: 'accept' }, [
  call('rename_concept', { oldSlug: 'capabilities/faq', newKind: 'element', domain: 'domains/order', confirm: true }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newKind: 'element', newSlug: 'elements/cart', domain: 'domains/order', body: 'Replaced.', confirm: true }),
  call('list_concepts', { limit: 1 }),
]);
add('safety', 'write-with-consent-absorb-outside-the-repository', { vault: 'library', env: { OATLAS_WRITE_CONSENT: 'true', OATLAS_REPO_ROOT: '$VAULT' }, capabilities: { elicitation: { form: {} } }, elicit: 'decline' }, [
  call('absorb_document', { filePath: '$PARENT/outside/absorb-me.md', allowOutsideRepo: true, confirm: true }),
  call('absorb_document', { filePath: '$PARENT/outside/absorb-me.md', allowOutsideRepo: true, confirm: false }),
]);
add('safety', 'consent-question-open-while-a-read-arrives', { vault: 'storefront', env: { OATLAS_WRITE_CONSENT: '1' }, capabilities: { elicitation: { form: {} } }, elicit: 'none' }, [
  call('add_concepts', { concepts: [{ slug: 'elements/asked', kind: 'element', title: 'Asked' }] }, { noWait: true }),
  call('list_concepts', { limit: 1 }),
  call('get_concepts', { slugs: ['capabilities/cart'] }),
  { $: 'wait', ms: 200 },
  { $: 'close-stdin' },
  { $: 'await', id: 1 },
]);
add('safety', 'standard-input-closes-while-a-consent-question-is-open', { vault: 'storefront', env: { OATLAS_WRITE_CONSENT: '1' }, capabilities: { elicitation: { form: {} } }, elicit: 'none' }, [
  call('patch_concept', { slug: 'capabilities/cart', body: 'asked' }, { noWait: true, settleMs: 300 }),
  { $: 'close-stdin' },
  { $: 'await', id: 1 },
]);
add('safety', 'stale-and-raced-writes', { vault: 'storefront' }, [
  call('get_concepts', { slugs: ['capabilities/cart'], body: 'excerpt' }),
  call('patch_concept', { slug: 'capabilities/cart', body: 'stale', expected_mtime: 1_700_000_000_000 }),
  { $: 'touch', path: 'capabilities/cart.md', mtimeMs: 1_700_000_500_000.5 },
  call('patch_concept', { slug: 'capabilities/cart', body: 'raced', expected_mtime: 1_700_000_000_000 + 1000.3125 }),
  call('patch_concept', { slug: 'capabilities/cart', body: 'accepted', expected_mtime: 1_700_000_500_000.5 }, { as: 'accepted-patch' }),
  call('patch_concept', { slug: 'capabilities/cart', body: 'immediately again', expected_mtime: answerOf('accepted-patch', 'result.structuredContent.mtime') }),
  { $: 'write-file', path: 'capabilities/cart.md', text: '---\nuid: b000aa3e-d9da-4e0d-bcc1-644934df42f1\nslug: capabilities/cart\nkind: capability\ntitle: Raced\ndomain: domains/order\n---\n\nChanged behind the server.\n' },
  call('patch_concept', { slug: 'capabilities/cart', body: 'after the race', expected_mtime: 1_700_000_500_000.5 }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/raced', confirm: true, expected_mtime: 1_700_000_500_000.5 }),
  call('delete_concept', { slug: 'capabilities/cart', confirm: true, expected_mtime: 1_700_000_500_000.5 }),
  call('merge_concepts', { fromSlug: 'capabilities/cart', intoSlug: 'capabilities/checkout', confirm: true, expected_mtime: 1 }),
  call('remove_relation', { from: 'capabilities/cart', to: 'capabilities/x', type: 'depends_on', replaceWith: { to: 'capabilities/y', type: 'depends_on', why: 'x' }, confirm: true, expected_mtime: 1 }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newKind: 'element', confirm: true, expected_mtime: 1 }),
  call('remove_relation', { from: 'capabilities/cart', to: 'capabilities/checkout', type: 'depends_on', confirm: true, expected_mtime: 1 }),
]);
for (const [label, value] of [['negative', -1], ['string', '5'], ['nan-like', 'NaN'], ['huge', 1e308], ['fractional-tiny', 0.0001], ['zero', 0], ['null', null], ['boolean', true]]) {
  add('safety', `expected-mtime-${label}`, { vault: 'storefront' }, [call('patch_concept', { slug: 'capabilities/cart', body: 'x', expected_mtime: value }), call('delete_concept', { slug: 'capabilities/faq', confirm: true, expected_mtime: value })]);
}
add('safety', 'write-guards-on-every-writer', { vault: 'storefront' }, [
  call('add_concepts', { concepts: [{ slug: 'elements/guard', kind: 'element', title: 'Guard' }], dryRun: true }),
  call('add_concepts', { concepts: [{ slug: 'elements/guard', kind: 'element', title: 'Guard' }], dry_run: true }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/guard' }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/guard', confirm: false }),
  call('rename_concept', { oldSlug: 'capabilities/cart', newSlug: 'capabilities/guard', confirm: 'true' }),
  call('delete_concept', { slug: 'capabilities/faq' }),
  call('delete_concept', { slug: 'capabilities/faq', confirm: 1 }),
  call('delete_concept', { slug: 'capabilities/cart', confirm: true }),
  call('merge_concepts', { fromSlug: 'capabilities/faq', intoSlug: 'capabilities/inquiry' }),
  call('rename_concept', { oldSlug: 'capabilities/faq', newKind: 'element' }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on' }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on', replaceWith: { to: 'capabilities/faq', type: 'depends_on', why: 'x' } }),
  call('absorb_document', { filePath: '$VAULT/storefront.md' }),
  call('absorb_document', { filePath: '$VAULT/storefront.md', confirm: true }),
]);
add('safety', 'audit-lines-for-each-writer', { vault: 'storefront' }, [
  call('add_concepts', { concepts: [{ slug: 'elements/audit', kind: 'element', title: 'Audit' }] }),
  call('add_relations', { relations: [{ from: 'elements/audit', to: 'capabilities/cart', type: 'relates', why: 'audit' }] }),
  call('patch_concept', { slug: 'elements/audit', body: 'audited' }),
  call('rename_concept', { oldSlug: 'elements/audit', newSlug: 'elements/audited', confirm: true }),
  call('rename_concept', { oldSlug: 'elements/audited', newKind: 'capability', domain: 'domains/order', confirm: true }),
  call('merge_concepts', { fromSlug: 'capabilities/audited', intoSlug: 'capabilities/cart', confirm: true }),
  call('delete_concept', { slug: 'capabilities/faq', confirm: true }),
  call('remove_relation', { from: 'capabilities/checkout', to: 'capabilities/cart', type: 'depends_on', confirm: true }),
  call('add_concepts', { concepts: [{ slug: 'elements/failing', kind: 'nonsense', title: 'Fails' }] }),
]);
add('safety', 'audit-lines-carry-the-client-name', { vault: 'storefront', handshake: false }, [
  req('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Línea "quoted" \n newline \u2028 \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8', version: '1' } }),
  { notify: 'notifications/initialized' },
  call('add_concepts', { concepts: [{ slug: 'elements/named-client', kind: 'element', title: 'Named Client' }] }),
  req('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x'.repeat(500), version: '1' } }),
  call('add_concepts', { concepts: [{ slug: 'elements/named-client-2', kind: 'element', title: 'Named Client Two' }] }),
]);
add('safety', 'side-files-already-present-and-corrupt', { vault: 'storefront' }, [
  { $: 'write-file', path: '.ontology-atlas/activity.jsonl', text: 'not json\n{"v":99}\n\n' },
  { $: 'write-file', path: '.ontology-atlas/map-analysis.jsonl', text: '{"v":1,"analysis":"x"}\ngarbage\n' },
  call('add_concepts', { concepts: [{ slug: 'elements/after-corrupt', kind: 'element', title: 'After Corrupt' }] }),
]);
add('safety', 'oversized-and-odd-files-in-writes', { vault: 'edge-hostile' }, [
  call('patch_concept', { slug: 'oversized', body: 'shrunk' }),
  call('get_concepts', { slugs: ['oversized'], body: 'summary' }),
  call('delete_concept', { slug: 'oversized', confirm: true, force: true }),
  call('rename_concept', { oldSlug: 'oversized', newSlug: 'big', confirm: true }),
  call('add_concepts', { concepts: [{ slug: 'elements/huge', kind: 'element', title: 'Huge', body: 'x'.repeat(2_000_000) }] }),
]);

// ---------------------------------------------------------------------------------------------
// confined source reads on a real snapshot descriptor (inherited descriptor 198), at each limit
// ---------------------------------------------------------------------------------------------

const SNAPSHOT_ENV = { OATLAS_CONFINED_SOURCE_READS: '1', OATLAS_SOURCE_SNAPSHOT_FD: '198' };
const snapshotReads = () => [
  call('infer_imports', { rootPath: '$PARENT' }),
  call('inspect_architecture', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT' }),
  call('analyze_repo_structure', { rootPath: '$PARENT', sourceReads: [{ path: 'src/order/placement.ts', symbol: 'placeOrder' }, { path: 'src/payment/charge.ts', mode: 'outline' }, { path: '.env', mode: 'outline' }, { path: '../outside', mode: 'outline' }, { path: 'missing.ts', mode: 'outline' }] }),
  call('read_source', { path: 'src/order/placement.ts' }),
];
const snapshotCase = (name, snapshot, steps = snapshotReads()) =>
  add('safety', `confined-reads-${name}`, { vault: 'miniature-repo', env: SNAPSHOT_ENV, snapshot }, steps);

snapshotCase('valid-snapshot', {});
snapshotCase('snapshot-of-another-root', {}, [call('infer_imports', { rootPath: '$PARENT/src' }), call('infer_imports', { rootPath: '$PARENT' })]);
snapshotCase('snapshot-at-the-entry-cap', { totalEntries: 12_000 });
snapshotCase('snapshot-over-the-entry-cap', { totalEntries: 12_001 });
snapshotCase('snapshot-marked-truncated', { truncated: true });
snapshotCase('snapshot-with-another-contract', { contract: 'confinedSourceSnapshot:v2' });
snapshotCase('file-text-at-the-cap', { fileTextBytes: 512 * 1024 });
snapshotCase('file-text-over-the-cap', { fileTextBytes: 512 * 1024 + 1 });
snapshotCase('total-text-over-the-cap', { totalTextBytes: 33 * 1024 * 1024 });
snapshotCase('descriptor-at-the-transport-limit', { descriptorBytes: 64 * 1024 * 1024 });
snapshotCase('descriptor-over-the-transport-limit', { descriptorBytes: 64 * 1024 * 1024 + 1 });

// ---------------------------------------------------------------------------------------------
// a handler that fails in a way no argument check expects, and a kill in the middle of a batch
// ---------------------------------------------------------------------------------------------

const LOCKED_NODE = '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: capabilities/locked\nkind: capability\ntitle: Locked\ndomain: domains/order\n---\n\nLocked body.\n';
const readsAndWrites = (slug) => [
  call('list_concepts', {}),
  call('get_concepts', { slugs: [slug], body: 'full' }),
  call('find_backlinks', { slug }),
  call('compile_ontology', { summary: true }),
  call('validate_vault', {}),
  call('list_concepts', { filter: 'kind=capability' }),
  call('patch_concept', { slug, body: 'changed' }),
  call('rename_concept', { oldSlug: slug, newSlug: `${slug}-renamed`, confirm: true }),
  call('delete_concept', { slug, confirm: true }),
  call('add_relations', { relations: [{ from: slug, to: 'capabilities/cart', type: 'relates', why: 'x' }] }),
  call('list_concepts', {}),
];
add('safety', 'handler-fails-on-an-unreadable-file', { vault: 'storefront' }, [
  { $: 'write-file', path: 'capabilities/locked.md', text: LOCKED_NODE },
  { $: 'chmod', path: 'capabilities/locked.md', mode: 0 },
  ...readsAndWrites('capabilities/locked'),
]);
add('safety', 'handler-fails-on-a-folder-named-like-a-node', { vault: 'storefront' }, [
  { $: 'mkdir', path: 'capabilities/folder.md' },
  ...readsAndWrites('capabilities/folder'),
]);
add('safety', 'handler-fails-on-a-link-to-itself', { vault: 'storefront' }, [
  { $: 'symlink', path: 'capabilities/loop.md', target: 'loop.md' },
  ...readsAndWrites('capabilities/loop'),
]);
add('safety', 'killed-during-a-batch-write', { vault: 'storefront', folder: 'invariants', invariants: ['atomic-writes'] }, [
  call('add_concepts', {
    concepts: Array.from({ length: 40 }, (_, index) => ({ slug: `elements/batch-${index}`, kind: 'element', title: `Batch ${index}`, body: 'x'.repeat(4000) })),
  }, { noWait: true, settleMs: 0, timeoutMs: 1000 }),
  { $: 'kill-after-first-write' },
]);
add('safety', 'secrets-are-never-shown', { vault: 'edge-hostile' }, [
  call('get_concepts', { slugs: ['.env', 'credentials', 'id_rsa', 'service-account', '.npmrc'], body: 'full' }),
  ...['.env', '.env.local', 'credentials.json', 'id_rsa', 'service-account.json', '.npmrc'].map((file) => call('read_source', { path: file })),
  call('list_concepts', { mentions: 'SECRET-SENTINEL-env' }),
  call('list_concepts', { mentions: 'credentials' }),
  call('list_concepts', {}),
  call('analyze_repo_structure', { rootPath: '$VAULT', sourceReads: ['.env', 'credentials.json', 'id_rsa'].map((file) => ({ path: file, mode: 'outline' })) }),
  call('infer_imports', { rootPath: '$VAULT' }),
]);
add('safety', 'sources-folder-is-a-link', { vault: 'sources-folder-link' }, [
  call('validate_vault', { limit: 500 }),
  call('list_concepts', {}),
  call('read_source', { path: 'sources/claims-a-kind.md' }),
  call('read_source', { path: 'sources/notes.md' }),
  call('find_evidence', { title: 'SECRET-SENTINEL-linked-sources' }),
  call('find_evidence', { title: 'Claims A Kind' }),
  call('get_concepts', { slugs: ['sources/claims-a-kind'], body: 'full' }),
]);

function resolveLabels(value, labels, caseName) {
  if (typeof value === 'string') {
    return value.replace(/^\$ANSWER\(@([\w-]+),/, (_, label) => {
      if (!labels.has(label)) throw new Error(`${caseName}: $ANSWER names the label "${label}", which no earlier step has`);
      return `$ANSWER(${labels.get(label)},`;
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolveLabels(item, labels, caseName));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveLabels(item, labels, caseName)]));
  }
  return value;
}

/**
 * The cases with request ids filled in (each step that needs an id gets the next integer), labels
 * resolved to those ids, and the late-clock twin of each case of the families that read documents.
 */
export function buildCorpus() {
  const built = cases.map((definition) => {
    let next = 1;
    const labels = new Map();
    const steps = definition.steps.map((step) => {
      if (step.id !== AUTO) return step;
      const { as, ...rest } = step;
      const id = next++;
      if (as) labels.set(as, id);
      return resolveLabels({ ...rest, id }, labels, definition.name);
    });
    for (const step of steps) {
      if (step.$ === 'await' && typeof step.id !== 'number') throw new Error(`${definition.name}: await needs an id`);
    }
    return { ...definition, steps };
  });
  const twins = built
    .filter((definition) => LATE_CLOCK_FAMILIES.has(definition.family))
    .map((definition) => {
      const name = `${definition.name}-late-clock`;
      return { ...definition, name, header: { ...definition.header, case: name, clockMs: LATE_CLOCK_MS } };
    });
  return [...built, ...twins];
}
