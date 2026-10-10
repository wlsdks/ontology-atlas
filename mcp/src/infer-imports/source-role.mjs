export function sourceRoleOf(filePath) {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  const segments = normalized.split('/');
  if (segments.some((segment) => ['test', 'tests', '__tests__'].includes(segment))) {
    return 'test';
  }
  const fileName = segments.at(-1) ?? '';
  const stem = fileName.replace(/\.(?:[cm]?[jt]sx?|py|rs)$/i, '');
  if (/\.(?:test|spec)$/.test(stem) || /^test_.+/.test(stem) || /.+_test$/.test(stem)) {
    return 'test';
  }
  return 'production';
}
