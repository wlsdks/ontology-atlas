import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProcessTable } from './read-process-table.mjs';
import { sumProcessTree } from './sum-process-tree.mjs';

test('the tree sum counts the root and every descendant, and nothing else', () => {
  const table = [
    { pid: 1, ppid: 0, residentKb: 9_000_000 }, // the machine's init, above the root
    { pid: 100, ppid: 1, residentKb: 50 }, // the shell the build command runs in: the root
    { pid: 200, ppid: 100, residentKb: 300 }, // pnpm
    { pid: 300, ppid: 200, residentKb: 2_000 }, // the build tool
    { pid: 301, ppid: 300, residentKb: 700 }, // one of its workers, two levels down
    { pid: 302, ppid: 300, residentKb: 800 },
    { pid: 400, ppid: 1, residentKb: 5_000 }, // a sibling tree that merely runs at the same time
    { pid: 500, ppid: 999, residentKb: 6_000 }, // orphaned: its parent is not in the table
  ];
  assert.deepEqual(sumProcessTree(table, 100), { residentKb: 50 + 300 + 2_000 + 700 + 800, processCount: 5 });
});

test('the tree sum is zero when the root is gone and stops on a looped snapshot', () => {
  assert.deepEqual(sumProcessTree([{ pid: 2, ppid: 1, residentKb: 10 }], 100), { residentKb: 0, processCount: 0 });
  const looped = [
    { pid: 10, ppid: 11, residentKb: 1 },
    { pid: 11, ppid: 10, residentKb: 2 },
  ];
  assert.deepEqual(sumProcessTree(looped, 10), { residentKb: 3, processCount: 2 });
});

test('the process table parses the ps output and the CRLF output PowerShell writes', () => {
  const ps = '    1     0   9216\n  100     1     50\n  garbage line here\n';
  assert.deepEqual(parseProcessTable(ps), [
    { pid: 1, ppid: 0, residentKb: 9216 },
    { pid: 100, ppid: 1, residentKb: 50 },
  ]);
  const powershell = '4 0 24\r\n1234 4 20480\r\n\r\n';
  assert.deepEqual(parseProcessTable(powershell), [
    { pid: 4, ppid: 0, residentKb: 24 },
    { pid: 1234, ppid: 4, residentKb: 20480 },
  ]);
});
