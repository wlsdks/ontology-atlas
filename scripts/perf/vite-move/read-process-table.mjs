import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Windows has no `ps`, and `wmic` is removed from current Windows. `Win32_Process` carries both
 * the parent id and the working set in bytes in one query; `Get-Process` has no parent id in
 * Windows PowerShell 5.1, which every Windows ships, so it cannot walk a tree.
 * - Win32_Process: https://learn.microsoft.com/windows/win32/cimwin32prov/win32-process
 * - Get-CimInstance: https://learn.microsoft.com/powershell/module/cimcmdlets/get-ciminstance
 *
 * One PowerShell stays alive, because starting one per sample costs more than the 100 ms
 * interval. Each line Node writes to its stdin asks for one table; the answer ends with the
 * `TABLE_END` line. Not run on Windows by the author: the parser is covered by a test fed the
 * CRLF output PowerShell writes, the loop is not.
 */
const TABLE_END = 'TABLE_END';
const WINDOWS_TABLE_SCRIPT = [
  'while ($null -ne [Console]::In.ReadLine()) {',
  "  Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, [int64]($_.WorkingSetSize / 1KB) }",
  `  '${TABLE_END}'`,
  '}',
].join('\n');

/** Rows of `pid ppid residentKb`, one per line, as `ps -o pid=,ppid=,rss=` and the Windows script write them. */
export function parseProcessTable(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 3) continue;
    const [pid, ppid, residentKb] = fields.map(Number);
    if (![pid, ppid, residentKb].every(Number.isInteger)) continue;
    rows.push({ pid, ppid, residentKb });
  }
  return rows;
}

function posixReader() {
  return {
    async read() {
      // `rss` is in kilobytes on macOS and Linux (ps(1)).
      const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid=,ppid=,rss='], { maxBuffer: 32 * 1024 * 1024 });
      return parseProcessTable(stdout);
    },
    close() {},
  };
}

function windowsReader() {
  const shell = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_TABLE_SCRIPT], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  let pending = null;
  let received = '';
  shell.stdout.setEncoding('utf8');
  shell.stdout.on('data', (chunk) => {
    received += chunk;
    const end = received.indexOf(TABLE_END);
    if (end === -1 || !pending) return;
    const answer = pending;
    pending = null;
    const table = parseProcessTable(received.slice(0, end));
    received = received.slice(end + TABLE_END.length);
    answer.resolve(table);
  });
  shell.on('exit', () => pending?.reject(new Error('the PowerShell process table reader exited')));
  return {
    read() {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        shell.stdin.write('\n');
      });
    },
    close() {
      shell.stdin.end();
    },
  };
}

/** `{ read(): Promise<rows>, close() }` for this platform. */
export function createProcessTableReader(platform = process.platform) {
  return platform === 'win32' ? windowsReader() : posixReader();
}
