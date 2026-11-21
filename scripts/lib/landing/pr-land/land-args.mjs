/** `pnpm pr:land`'s command line: its flags, the retired ones, and the combinations it refuses. */

const RETIRED_FLAGS = {
  '--parallel-ci': '--parallel-ci is retired: `pnpm pr:ci <n>` then `pnpm pr:land <n>` lets the fast path merge any disjoint green change',
  '--worktree': '--worktree is retired: a landing runs no local lanes now (each author ran `pnpm checks:changed`; the train runs CI once)',
};

export function parseArgs(argv) {
  const args = {
    numbers: [],
    number: null,
    cleanup: null,
    queue: false,
    release: false,
    ci: false,
    plan: false,
    conduct: false,
    wait: true,
    fast: true,
    speculate: true,
    // `null` measures the size from recent trains (`chooseBatch`); `--batch=<n>` fixes it.
    batch: null,
    worktree: null,
    timeoutMinutes: 180,
    allowFailing: [],
    flaky: [],
    notes: [],
  };
  const names = (arg, flag) => {
    const list = arg.slice(flag.length).split(',').map((name) => name.trim()).filter(Boolean);
    if (list.length === 0) throw new Error(`${flag.slice(0, -1)} must name at least one check context`);
    return list;
  };
  const retire = (flag) => {
    if (!args.notes.includes(RETIRED_FLAGS[flag])) args.notes.push(RETIRED_FLAGS[flag]);
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--' || arg === '') continue;
    if (arg === '--queue') args.queue = true;
    else if (arg === '--release') args.release = true;
    else if (arg === '--ci') args.ci = true;
    else if (arg === '--plan') args.plan = true;
    else if (arg === '--conduct') args.conduct = true;
    else if (arg === '--no-wait') args.wait = false;
    else if (arg === '--no-fast') args.fast = false;
    else if (arg === '--no-speculate') args.speculate = false;
    else if (arg === '--parallel-ci') retire(arg);
    else if (arg.startsWith('--batch=')) {
      const size = Number(arg.slice('--batch='.length));
      if (!Number.isInteger(size) || size < 1) throw new Error(`--batch must be a positive integer; received ${arg}`);
      args.batch = size;
    } else if (arg === '--cleanup') {
      args.cleanup = argv[index + 1] ?? null;
      index += 1;
      if (!args.cleanup) throw new Error('--cleanup needs a worktree path');
    } else if (arg.startsWith('--cleanup=')) args.cleanup = arg.slice('--cleanup='.length);
    else if (arg === '--worktree') {
      args.worktree = argv[index + 1] ?? null;
      index += 1;
      if (!args.worktree) throw new Error('--worktree needs a path');
      retire('--worktree');
    } else if (arg.startsWith('--worktree=')) {
      args.worktree = arg.slice('--worktree='.length);
      retire('--worktree');
    } else if (arg.startsWith('--timeout-minutes=')) {
      const minutes = Number(arg.slice('--timeout-minutes='.length));
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new Error(`--timeout-minutes must be positive; received ${arg}`);
      }
      args.timeoutMinutes = minutes;
    } else if (arg.startsWith('--allow-failing=')) {
      args.allowFailing = [...new Set([...args.allowFailing, ...names(arg, '--allow-failing=')])];
    } else if (arg.startsWith('--flaky=')) {
      args.flaky = [...new Set([...args.flaky, ...names(arg, '--flaky=')])];
    } else if (/^#?\d+$/.test(arg)) args.numbers.push(Number(arg.replace('#', '')));
    else throw new Error(`unknown argument: ${arg}`);
  }
  args.number = args.numbers[0] ?? null;
  const modes = [args.queue, args.release, args.ci, args.plan, args.conduct].filter(Boolean).length;
  if (modes > 1) throw new Error('--queue, --release, --ci, --plan and --conduct are separate commands');
  if (args.plan && args.numbers.length === 0) throw new Error('--plan needs at least one pull request number');
  if (args.ci && args.number === null) throw new Error('pnpm pr:ci needs a pull request number');
  if (!args.plan && args.numbers.length > 1) throw new Error('land one pull request per command; `--plan` takes several');
  if (!args.queue && !args.release && !args.conduct && args.number === null) {
    throw new Error('a pull request number is required: pnpm pr:land <number>');
  }
  return args;
}
