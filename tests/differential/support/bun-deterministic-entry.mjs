// Entry of the Bun comparison build: the pinned clock first, then the server unchanged. A compiled
// Bun program takes no `--import` at run time, so `scripts/mcp/differential/build-bun-twin.mjs`
// compiles this file with the shipped binary's flags and swaps the server's `node:crypto` import
// for a seeded source. The UUID seed is read from `ATLAS_DIFF_UID_SEED` when the program runs.
import { installFixedClock } from './deterministic-inputs.mjs';

installFixedClock();

await import('../../../mcp/src/javascript-server.mjs');
