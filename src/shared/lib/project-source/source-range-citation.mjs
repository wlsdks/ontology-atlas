const SOURCE_RANGE_PREFIX = 'source:';
const SOURCE_RANGE = /^source:(.+)#L([1-9][0-9]*)-L([1-9][0-9]*)@sha256:([a-f0-9]{64})$/;

function wellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function isPersistableRelativePath(value, { allowRoot = false } = {}) {
  if (allowRoot && value === '.') return true;
  return typeof value === 'string' && value.length > 0 && value.length <= 500
    && value.trim() === value && !value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.includes('\\') && !value.includes('`') && !value.includes(', ')
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

export function parseSourceRangeCitation(value) {
  if (typeof value !== 'string' || !value.startsWith(SOURCE_RANGE_PREFIX)) return null;
  const match = SOURCE_RANGE.exec(value);
  if (!match || /[:#]/.test(match[1]) || !wellFormedUnicode(match[1]) || !isPersistableRelativePath(match[1])) return null;
  const startLine = Number(match[2]);
  const endLine = Number(match[3]);
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || endLine < startLine) return null;
  return { reference: value, path: match[1], startLine, endLine, sha256: match[4] };
}

export function isPersistablePathWitness(value) {
  return typeof value === 'string' && !value.startsWith(SOURCE_RANGE_PREFIX)
    && isPersistableRelativePath(value, { allowRoot: true });
}

export function isPersistableEvidenceReference(value) {
  return typeof value === 'string' && value.startsWith(SOURCE_RANGE_PREFIX)
    ? parseSourceRangeCitation(value) !== null
    : isPersistableRelativePath(value, { allowRoot: true });
}
