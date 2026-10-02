import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  forgetApproval,
  forgetMachineApprovals,
  listMachineApprovals,
  readMachineApprovals,
  recordApproval,
  subscribeMachineApprovals,
} from './machine-approvals';
import { MACHINE_APPROVALS_STORAGE_KEY as KEY } from './machine-approvals-format';

const FOLDER = '/Users/probe/cloned';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("this Mac's allowances", () => {
  it('allows nothing until a press records it, and only the exact definition then', () => {
    expect(readMachineApprovals().approves('connector', FOLDER, 'c1', 'v1')).toBe(false);
    expect(recordApproval('connector', FOLDER, 'c1', 'v1')).toBe(true);
    const approvals = readMachineApprovals();
    expect(approvals.approves('connector', FOLDER, 'c1', 'v1')).toBe(true);
    expect(approvals.approves('connector', FOLDER, 'c1', 'v2')).toBe(false);
    expect(approvals.allowed('connector', FOLDER, 'c1')).toBe('v1');
  });

  it('keeps each folder and each kind of item apart', () => {
    recordApproval('connector', FOLDER, 'c1', 'v1');
    const approvals = readMachineApprovals();
    expect(approvals.approves('connector', '/Users/probe/other', 'c1', 'v1')).toBe(false);
    expect(approvals.approves('round', FOLDER, 'c1', 'v1')).toBe(false);
  });

  it('allows nothing where there is no folder path, as on the web', () => {
    expect(recordApproval('round', null, 'r1', 'v1')).toBe(false);
    expect(readMachineApprovals().approves('round', null, 'r1', 'v1')).toBe(false);
  });

  it('forgets an item that left the folder', () => {
    recordApproval('round', FOLDER, 'r1', 'v1');
    forgetApproval('round', FOLDER, 'r1');
    expect(readMachineApprovals().allowed('round', FOLDER, 'r1')).toBeNull();
  });

  it('reads a corrupt or foreign value as nothing allowed', () => {
    for (const raw of ['{not json', '{"v":2,"allowed":[]}', '[]', '{"v":1,"allowed":[["connector","/x","c1"]]}']) {
      window.localStorage.setItem(KEY, raw);
      expect(readMachineApprovals().approves('connector', '/x', 'c1', 'v1')).toBe(false);
    }
  });

  it('treats an id such as __proto__ from a folder file as nothing but a key', () => {
    expect(readMachineApprovals().allowed('round', FOLDER, '__proto__')).toBeNull();
    recordApproval('round', FOLDER, '__proto__', 'v1');
    expect(readMachineApprovals().approves('round', FOLDER, '__proto__', 'v1')).toBe(true);
    expect(readMachineApprovals().allowed('round', FOLDER, 'constructor')).toBeNull();
  });

  it('still honours a press for this run when storage refuses to keep it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(recordApproval('connector', FOLDER, 'c1', 'v1')).toBe(true);
    expect(readMachineApprovals().approves('connector', FOLDER, 'c1', 'v1')).toBe(true);
    vi.restoreAllMocks();
    forgetApproval('connector', FOLDER, 'c1');
    expect(window.localStorage.getItem(KEY)).toBe('{"v":1,"allowed":[]}');
  });

  it('tells subscribers when an allowance changes, here or in another window', () => {
    const heard = vi.fn();
    const stop = subscribeMachineApprovals(heard);
    recordApproval('connector', FOLDER, 'c1', 'v1');
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    stop();
    recordApproval('connector', FOLDER, 'c2', 'v1');
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe('the allowances list in Settings', () => {
  const OTHER = '/Users/probe/other';

  it('lists what was allowed without the allowed definition', () => {
    recordApproval('connector', FOLDER, 'c1', 'secret-definition');
    recordApproval('round', OTHER, 'r1', 'v1');
    const list = listMachineApprovals();
    expect(list).toEqual([
      { subject: 'connector', folder: FOLDER, id: 'c1' },
      { subject: 'round', folder: OTHER, id: 'r1' },
    ]);
    expect(JSON.stringify(list)).not.toContain('secret-definition');
    expect(listMachineApprovals()).toBe(list);
  });

  it('forgets one folder and leaves the others allowed', () => {
    recordApproval('connector', FOLDER, 'c1', 'v1');
    recordApproval('round', FOLDER, 'r1', 'v1');
    recordApproval('round', OTHER, 'r1', 'v1');
    forgetMachineApprovals({ folder: FOLDER });
    expect(listMachineApprovals()).toEqual([{ subject: 'round', folder: OTHER, id: 'r1' }]);
    expect(readMachineApprovals().approves('round', OTHER, 'r1', 'v1')).toBe(true);
  });

  it('forgets every folder when no folder is named', () => {
    recordApproval('connector', FOLDER, 'c1', 'v1');
    recordApproval('round', OTHER, 'r1', 'v1');
    forgetMachineApprovals();
    expect(listMachineApprovals()).toEqual([]);
    expect(readMachineApprovals().approves('connector', FOLDER, 'c1', 'v1')).toBe(false);
  });

  it('writes nothing when there is nothing to forget', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    forgetMachineApprovals({ folder: FOLDER });
    expect(setItem).not.toHaveBeenCalled();
  });
});
