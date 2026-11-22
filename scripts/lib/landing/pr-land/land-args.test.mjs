import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseArgs } from './land-args.mjs';
import { describeCleanup, worktreeToRemove } from './landing-deps.mjs';

describe('pr:land argument parsing', () => {
  it('reads a number with or without a hash', () => {
    assert.equal(parseArgs(['1572']).number, 1572);
    assert.equal(parseArgs(['#1572']).number, 1572);
    assert.equal(parseArgs(['--', '1572']).number, 1572);
  });

  it('reads the train, fast-path and waiting options', () => {
    const args = parseArgs(['12', '--batch=5', '--no-wait', '--no-fast', '--no-speculate', '--flaky=A,B', '--allow-failing=C']);
    assert.deepEqual([args.batch, args.wait, args.fast, args.speculate, args.flaky, args.allowFailing], [5, false, false, false, ['A', 'B'], ['C']]);
    const defaults = parseArgs(['12']);
    // No --batch: the conductor measures the size from recent trains.
    assert.deepEqual([defaults.batch, defaults.wait, defaults.fast, defaults.speculate], [null, true, true, true]);
    assert.throws(() => parseArgs(['12', '--batch=0']), /positive integer/);
    assert.throws(() => parseArgs(['12', '--flaky=']), /must name at least one/);
  });

  it('plans several pull requests, but lands one per command', () => {
    assert.deepEqual(parseArgs(['--plan', '12', '#13']).numbers, [12, 13]);
    assert.throws(() => parseArgs(['--plan']), /--plan needs/);
    assert.throws(() => parseArgs(['12', '13']), /one pull request per command/);
  });

  it('needs no number to show the queue, release the lock, or conduct', () => {
    assert.equal(parseArgs(['--queue']).queue, true);
    assert.equal(parseArgs(['--release']).release, true);
    assert.equal(parseArgs(['--conduct']).conduct, true);
    assert.equal(parseArgs(['--ci', '1572']).ci, true);
    assert.throws(() => parseArgs(['--ci']), /pull request number/);
    assert.throws(() => parseArgs(['--queue', '--conduct']), /separate commands/);
  });

  it('accepts the retired flags with a note instead of failing a landing that names them', () => {
    const args = parseArgs(['12', '--parallel-ci', '--worktree', '/tmp/wt']);
    assert.equal(args.number, 12);
    assert.equal(args.notes.length, 2);
    assert.match(args.notes.join('\n'), /--parallel-ci is retired/);
    assert.match(args.notes.join('\n'), /--worktree is retired/);
  });

  /** `--worktree` removes nothing, in either spelling; removal is `--cleanup`'s alone. */
  it('removes a worktree only when --cleanup asks, never for --worktree', () => {
    assert.equal(worktreeToRemove(parseArgs(['12', '--worktree', '/tmp/wt'])), null);
    assert.equal(worktreeToRemove(parseArgs(['12', '--worktree=/tmp/wt'])), null);
    assert.equal(worktreeToRemove(parseArgs(['12', '--cleanup', '/tmp/wt'])), '/tmp/wt');
    assert.equal(worktreeToRemove(parseArgs(['12', '--cleanup=/tmp/wt'])), '/tmp/wt');
    assert.equal(worktreeToRemove(parseArgs(['12'])), null);
  });

  it('announces the path and the judgement before removing anything', () => {
    assert.match(describeCleanup({ path: '/tmp/wt', status: '' }), /ignored files are not counted/);
    assert.equal(describeCleanup({ path: '/tmp/wt', status: ' M src/a.ts' }), '/tmp/wt still has uncommitted work; left alone');
    assert.equal(describeCleanup({ path: '/tmp/nope', status: null }), '/tmp/nope is not a Git worktree; left alone');
  });

  it('refuses a landing with no pull request named', () => {
    assert.throws(() => parseArgs([]), /pull request number is required/);
    assert.throws(() => parseArgs(['--cleanup']), /needs a worktree path/);
    assert.throws(() => parseArgs(['--worktree']), /needs a path/);
    assert.throws(() => parseArgs(['12', '--force']), /unknown argument/);
    assert.throws(() => parseArgs(['12', '--timeout-minutes=0']), /must be positive/);
  });
});
