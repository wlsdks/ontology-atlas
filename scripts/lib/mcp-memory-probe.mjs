// Test-only preload for `scripts/perf-mcp-memory.mjs`, loaded with
// `node --expose-gc --import`; the server never loads it. The harness opens fd 3
// as a pipe and names it in OATLAS_MEMORY_PROBE_FD. Each line it writes is
// `{ "id": n }`, and each answer is the heap after two forced collections, the
// one number the memory windows judge: resident size depends on the allocator
// and on other processes, and it does not come back down under Bun.

import net from 'node:net';

const fd = Number(process.env.OATLAS_MEMORY_PROBE_FD);
if (Number.isInteger(fd) && fd > 2 && typeof globalThis.gc === 'function') {
  const channel = new net.Socket({ fd, readable: true, writable: true });
  let pending = '';
  channel.on('data', (chunk) => {
    pending += chunk.toString('utf8');
    for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) {
      const request = JSON.parse(pending.slice(0, end));
      pending = pending.slice(end + 1);
      // On a later turn, so no tool call is partway through on the stack.
      setImmediate(() => {
        globalThis.gc();
        globalThis.gc();
        channel.write(`${JSON.stringify({ id: request.id, heapUsed: process.memoryUsage().heapUsed })}\n`);
      });
    }
  });
  // The probe must never be what keeps the server running.
  channel.unref();
}
