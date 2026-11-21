/**
 * Finds the existing node a dangling ref most likely meant (a typo or a missing
 * folder prefix): exact tail match first, then tail prefix. Ambiguous matches
 * return null so a confidently wrong fix is never proposed.
 */
export function findNearMatchSlug(ref, nodes) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  const lowerRaw = raw.toLowerCase();
  const exactTail = [];
  const prefixTail = [];
  for (const node of nodes) {
    const slug = node.slug;
    if (slug === raw) continue; // already resolves: wouldn't be dangling
    const tail = (slug.split('/').pop() || slug).toLowerCase();
    if (tail === lowerRaw) {
      exactTail.push(slug);
      continue;
    }
    if (tail.startsWith(lowerRaw) || lowerRaw.startsWith(tail)) {
      prefixTail.push(slug);
    }
  }
  if (exactTail.length === 1) return exactTail[0];
  if (exactTail.length === 0 && prefixTail.length === 1) return prefixTail[0];
  return null;
}

export function suggestedSlugForReference(ref, kind) {
  const prefix = kind === 'domain' ? 'domains' : kind === 'capability' ? 'capabilities' : 'elements';
  const raw = String(ref || '').trim();
  const withoutExtension = raw.replace(/\.[^.\/\\]+$/, '');
  const normalized = withoutExtension
    .split(/[\/\\]+/)
    .map(slugSegment)
    .filter(Boolean)
    .join('/');
  if (!normalized) return `${prefix}/unnamed`;
  if (normalized.startsWith(`${prefix}/`)) return normalized;
  return `${prefix}/${normalized}`;
}

function slugSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function titleFromReference(ref) {
  const raw = String(ref || '').trim();
  const base = raw.split(/[\/\\]+/).pop()?.replace(/\.[^.]+$/, '') || raw || 'Untitled';
  const words = base
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Untitled';
}
