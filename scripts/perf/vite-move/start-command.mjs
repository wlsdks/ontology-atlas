import { spawn, spawnSync } from 'node:child_process';

const OUTPUT_TAIL_BYTES = 4096;
const STOP_GRACE_MS = 5000;

/**
 * Starts a shell command as the root of its own process tree and returns it with a way to end
 * the whole tree. On POSIX the command leads a process group, which `kill(-pid)` ends; on
 * Windows `taskkill /T` ends the tree (https://learn.microsoft.com/windows-server/administration/windows-commands/taskkill).
 * The last bytes of its output are kept so a failed run can say why.
 */
export function startCommand(command, { cwd, env }) {
  const windows = process.platform === 'win32';
  const child = spawn(command, { cwd, env, shell: true, detached: !windows, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let outputTail = '';
  const keepTail = (chunk) => {
    outputTail = (outputTail + chunk).slice(-OUTPUT_TAIL_BYTES);
  };
  child.stdout.on('data', keepTail);
  child.stderr.on('data', keepTail);

  const exited = new Promise((resolve) => {
    child.on('error', (error) => resolve({ exitCode: null, signal: null, error: error.message }));
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });

  function signalTree(signal) {
    if (windows) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }

  return {
    pid: child.pid,
    exited,
    outputTail: () => outputTail,
    async stopTree() {
      signalTree('SIGTERM');
      const timer = setTimeout(() => signalTree('SIGKILL'), STOP_GRACE_MS);
      await exited;
      clearTimeout(timer);
      // The shell can exit before its descendants do; end whatever still holds the group.
      signalTree('SIGKILL');
    },
  };
}
