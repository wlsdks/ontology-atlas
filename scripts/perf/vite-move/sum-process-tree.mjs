/**
 * Resident memory of one process and everything it started, from one snapshot of the process
 * table (`{ pid, ppid, residentKb }` rows). A process whose parent is missing from the snapshot is
 * not counted: it was reparented, so it no longer belongs to the root's tree.
 */
export function sumProcessTree(table, rootPid) {
  const rootRow = table.find((row) => row.pid === rootPid);
  if (!rootRow) return { residentKb: 0, processCount: 0 };

  const childrenByParent = new Map();
  for (const row of table) {
    const siblings = childrenByParent.get(row.ppid) ?? [];
    siblings.push(row);
    childrenByParent.set(row.ppid, siblings);
  }

  const visited = new Set([rootRow.pid]);
  const queue = [rootRow];
  let residentKb = 0;
  while (queue.length > 0) {
    const row = queue.pop();
    residentKb += row.residentKb;
    for (const child of childrenByParent.get(row.pid) ?? []) {
      // A recycled pid can make one snapshot loop back on itself; visit each pid once.
      if (visited.has(child.pid)) continue;
      visited.add(child.pid);
      queue.push(child);
    }
  }
  return { residentKb, processCount: visited.size };
}
