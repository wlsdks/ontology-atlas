// Preloaded only by `scripts/perf-mcp-memory.mjs`; the server never imports it.

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
      setImmediate(() => {
        globalThis.gc();
        globalThis.gc();
        channel.write(`${JSON.stringify({ id: request.id, heapUsed: process.memoryUsage().heapUsed })}\n`);
      });
    }
  });
  channel.unref();
}
