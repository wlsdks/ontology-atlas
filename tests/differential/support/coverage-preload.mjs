// Node preload for `--coverage`: records which functions of `mcp/src` ran between one response and the
// next, so the harness can say which functions each tool executes. It uses the inspector's precise
// coverage and takes (and so resets) the counters after every complete line written to standard
// output; the first listing of each script (kept whole) names every function it has, run or not.
//
// Files written under `ATLAS_DIFF_COVERAGE_DIR`: `delta-<n>.json` ({ id, scripts }, executed functions
// only after the first listing) per response, and `final.json` ({ scripts }) at exit.
import inspector from 'node:inspector';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = process.env.ATLAS_DIFF_COVERAGE_DIR;

if (directory) {
  mkdirSync(directory, { recursive: true });
  const serverSources = pathToFileURL(path.resolve(import.meta.dirname, '..', '..', '..', 'mcp', 'src')).href;
  const session = new inspector.Session();
  session.connect();
  const post = (method, params) => {
    let failure = null;
    let result;
    session.post(method, params, (error, value) => {
      failure = error;
      result = value;
    });
    if (failure) throw failure;
    return result;
  };
  post('Profiler.enable');
  post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

  // V8 lists every function of a script the first time the script is collected, run or not, and
  // afterwards only the functions that ran since the last collection. The first listing is kept
  // whole (it is the harness's list of functions that exist); later ones keep the functions that ran.
  const listed = new Set();
  const take = () =>
    post('Profiler.takePreciseCoverage')
      .result.filter((script) => script.url.startsWith(serverSources) && !script.url.endsWith('.test.mjs'))
      .map((script) => {
        const first = !listed.has(script.url);
        listed.add(script.url);
        return { url: script.url, functions: first ? script.functions : script.functions.filter((fn) => fn.ranges[0].count > 0) };
      })
      .filter((script) => script.functions.length > 0);

  let sequence = 0;
  const write = process.stdout.write.bind(process.stdout);
  let carried = '';
  process.stdout.write = (chunk, ...rest) => {
    const accepted = write(chunk, ...rest);
    carried += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    for (let end = carried.indexOf('\n'); end >= 0; end = carried.indexOf('\n')) {
      const line = carried.slice(0, end);
      carried = carried.slice(end + 1);
      let id = null;
      try {
        const parsed = JSON.parse(line);
        if (parsed && !('method' in parsed) && 'id' in parsed) id = parsed.id;
      } catch {
        // A line that is not JSON is an interval with no request to blame.
      }
      writeFileSync(path.join(directory, `delta-${sequence}.json`), JSON.stringify({ id, scripts: take() }));
      sequence += 1;
    }
    return accepted;
  };
  process.on('exit', () => {
    writeFileSync(path.join(directory, 'final.json'), JSON.stringify({ scripts: take() }));
  });
}
