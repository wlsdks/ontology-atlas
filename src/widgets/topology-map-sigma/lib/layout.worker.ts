// Phase-0 echo worker (Task 1 de-risk). Replaced by the real layout engine in Task 3.
self.onmessage = (e: MessageEvent) => {
  const { ping } = e.data ?? {};
  (self as unknown as Worker).postMessage({ pong: ping, at: Date.now() });
};
export {};
