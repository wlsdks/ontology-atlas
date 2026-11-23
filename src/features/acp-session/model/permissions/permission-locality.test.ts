import { describe, expect, it } from 'vitest';

import { permissionLocality, widestPermissionLocality } from './permission-locality';

describe('permission request location: inside my project or somewhere else entirely', () => {
  const VAULT = '/Users/dana/my-product/atlas';

  it('treats code inside my project as "my project", not "outside"', () => {
    expect(permissionLocality(VAULT, '/Users/dana/my-product/src/orders.ts')).toBe('inside-project');
    expect(permissionLocality(VAULT, '/Users/dana/my-product')).toBe('inside-project');
  });

  it('keeps a truly different place as "outside", the side that needs a warning', () => {
    expect(permissionLocality(VAULT, '/Users/dana/.ssh/id_rsa')).toBe('elsewhere');
    expect(permissionLocality(VAULT, '/etc/hosts')).toBe('elsewhere');
  });

  it('does not count a similarly named neighbor as inside', () => {
    expect(permissionLocality(VAULT, '/Users/dana/my-product-archive/x.ts')).toBe('elsewhere');
  });

  it('makes the old read the only true one when the vault is not inside the project', () => {
    expect(permissionLocality('/Users/dana/notes', '/Users/dana/notes/../x')).toBe('elsewhere');
    expect(permissionLocality(null, '/anything')).toBe('elsewhere');
    expect(permissionLocality(VAULT, null)).toBe('elsewhere');
  });

  it('treats the opened folder as "inside" even with no project above it', () => {
    expect(permissionLocality(VAULT, `${VAULT}/domains/order.md`)).toBe('inside-folder');
    expect(permissionLocality('/Users/dana/notes', '/Users/dana/notes/order.md')).toBe(
      'inside-folder',
    );
    expect(permissionLocality('/Users/dana/notes/', '/Users/dana/notes')).toBe('inside-folder');
  });

  it('still treats a neighbor sharing a folder-name prefix as outside', () => {
    expect(permissionLocality('/Users/dana/notes', '/Users/dana/notes-old/x.md')).toBe('elsewhere');
  });

  it('keeps the warning for a path that cannot be resolved, wrong but safe', () => {
    expect(permissionLocality(VAULT, `${VAULT}/../../.ssh/id_rsa`)).toBe('elsewhere');
  });
});

describe('permission request location over several files', () => {
  const VAULT = '/Users/dana/my-product/atlas';

  it('is inside the folder only when every file is', () => {
    expect(widestPermissionLocality(VAULT, [`${VAULT}/wiki/a.md`, `${VAULT}/wiki/b.md`])).toBe('inside-folder');
    expect(widestPermissionLocality(VAULT, [`${VAULT}/wiki/a.md`, '/Users/dana/my-product/src/a.ts'])).toBe('inside-project');
    expect(widestPermissionLocality(VAULT, [`${VAULT}/wiki/a.md`, '/etc/hosts', '/Users/dana/my-product/src/a.ts'])).toBe('elsewhere');
  });

  it('keeps the warning when no file is named', () => {
    expect(widestPermissionLocality(VAULT, [])).toBe('elsewhere');
  });
});
