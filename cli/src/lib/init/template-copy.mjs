import { mkdirSync, existsSync, readFileSync, writeFileSync, cpSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ok } from '../status-lines.mjs';

const TEMPLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates');
const TEMPLATE_ROOT = resolve(TEMPLATES, 'vault');

/**
 * Starter body locale: only the prose differs across locales, so every locale yields the same graph and
 * canonical `title`. The CLI cannot see the UI language, so it takes a flag; English is the default.
 */

export const TEMPLATE_ROOTS = {
  en: TEMPLATE_ROOT,
  ko: resolve(TEMPLATES, 'vault-ko'),
};

export function resolveTemplateRoot(locale) {
  return TEMPLATE_ROOTS[locale] ?? TEMPLATE_ROOT;
}

export function copyTree(srcRoot, destRoot, { skip = () => false } = {}) {
  let created = 0;
  let skipped = 0;

  function walk(rel) {
    if (rel && skip(rel)) return;
    const src = rel ? join(srcRoot, rel) : srcRoot;
    const dest = rel ? join(destRoot, rel) : destRoot;
    const stat = statSync(src);
    if (stat.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      for (const entry of readdirSync(src)) {
        walk(rel ? join(rel, entry) : entry);
      }
    } else {
      if (existsSync(dest)) {
        skipped += 1;
      } else {
        mkdirSync(dirname(dest), { recursive: true });
        const template = readFileSync(src, 'utf-8');
        if (/^kind:\s*\S+/m.test(template)) {
          if (/^uid:\s*/m.test(template)) {
            throw new Error(`starter template must not contain a fixed uid: ${rel}`);
          }
          writeFileSync(dest, template.replace(/^---\n/, `---\nuid: ${randomUUID()}\n`), 'utf-8');
        } else {
          cpSync(src, dest);
        }
        created += 1;
        ok(`  ${rel}`);
      }
    }
  }

  walk('');
  return { created, skipped };
}
