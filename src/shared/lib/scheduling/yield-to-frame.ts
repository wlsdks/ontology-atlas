type YieldingScheduler = { yield?: () => Promise<void> };

/**
 * Gives the browser a turn to paint and answer input, then resumes. It resolves on the next task,
 * not the next animation frame: a hidden tab runs no frames, and long work must keep going there.
 * `scheduler.yield()` resumes ahead of other queued tasks where it exists; a message task is the
 * fallback because `setTimeout` is clamped to 4 ms after a few nested calls.
 */
export function yieldToFrame(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: YieldingScheduler }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
