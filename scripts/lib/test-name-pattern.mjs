export function readNodeTestNamePattern(argv = []) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--test-name-pattern') {
      const value = argv[index + 1];
      return value && !value.startsWith('-') ? value : null;
    }
    if (arg.startsWith('--test-name-pattern=')) return arg.slice('--test-name-pattern='.length);
  }
  return null;
}

export function resolveTestNamePattern({
  env = process.env,
  execArgv = process.execArgv,
  envName = 'OATLAS_TEST_NAME_PATTERN',
} = {}) {
  const envPattern = env[envName];
  const nodePattern = readNodeTestNamePattern(execArgv);
  const raw = envPattern || nodePattern;
  const source = envPattern ? envName : nodePattern ? 'node --test-name-pattern' : null;

  if (!raw) return { raw: null, source, pattern: null };

  try {
    return { raw, source, pattern: new RegExp(raw, 'i') };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid ${source || 'test name pattern'}: ${message}`);
  }
}

export function formatTestFilterSuffix(filter) {
  if (!filter?.pattern) return '';
  return `filter=${filter.raw}${filter.source ? `, source=${filter.source}` : ''}`;
}

export function formatNoTestMatchMessage(scope, filter) {
  return `no ${scope} integration tests matched ${filter?.source || 'test name pattern'}=${filter?.raw}`;
}
