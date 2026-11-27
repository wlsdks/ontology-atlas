import { connect } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

/** Whether something accepts a connection on `localhost:port`. */
export function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: 'localhost', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Waits until nothing listens on `port`; false when something still does after `timeoutMs`. */
export async function waitForPortClosed(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return true;
    await sleep(100);
  }
  return false;
}
