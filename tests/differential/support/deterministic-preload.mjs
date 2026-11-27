// Test-only: the harness passes this with `node --import` so one Node server process runs on a
// fixed clock and a seeded UUID source. Nothing in `mcp/src` imports it. The compiled Bun twin
// gets the same inputs through `scripts/mcp/differential/build-bun-twin.mjs`.
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';

import { installFixedClock, streamNameOfModule, uuidStream } from './deterministic-inputs.mjs';

installFixedClock();

if (process.env.ATLAS_DIFF_UID_SEED !== undefined) {
  const streams = new Map();
  crypto.randomUUID = () => {
    // Frame 0 is the message, 1 this function, 2 the module that asked.
    const asker = (new Error().stack ?? '').split('\n')[2] ?? '';
    const file = /\(?((?:file:\/\/)?[^()\s]+\.mjs)/.exec(asker)?.[1] ?? '';
    const name = streamNameOfModule(file);
    if (!streams.has(name)) streams.set(name, uuidStream(name));
    return streams.get(name)();
  };
  syncBuiltinESMExports();
}
