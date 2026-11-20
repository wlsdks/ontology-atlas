import { describe, expect, it } from 'vitest';

import { OFF_VECTOR_STATUS, type VectorFailure, type VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { deskLine, type DeskLineInput } from './desk-line';

const status = (fields: Partial<VectorStatus>): VectorStatus => ({ ...OFF_VECTOR_STATUS, ...fields });
const app = (value: VectorStatus | null, fields: Partial<DeskLineInput> = {}): DeskLineInput => ({
  status: value, isApp: true, indexOn: true, markdownFiles: 60, runnerModel: null, ...fields,
});
const PREPARING = status({ phase: 'preparing', filesDone: 312, filesTotal: 2000, passagesDone: 1480, passagesTotal: 9800, currentPath: 'wiki/architecture.md' });
const STOPPED = status({ phase: 'stopped', filesDone: 1240, filesTotal: 2000, passagesDone: 6020, passagesTotal: 9800 });

describe('deskLine', () => {
  it('says the web sentence with no press, whatever the status', () => {
    expect(deskLine(app(PREPARING, { isApp: false }))).toMatchObject({ message: 'web', action: null, progress: null });
  });

  it('offers setup when the folder is not set up', () => {
    expect(deskLine(app(status({ phase: 'notSetUp' })))).toMatchObject({ message: 'words', action: 'setup', tone: 'quiet' });
  });

  it('says there is nothing to prepare in a folder without Markdown files', () => {
    expect(deskLine(app(status({ phase: 'notSetUp' }), { markdownFiles: 0 }))).toMatchObject({ message: 'noFiles', action: null });
  });

  it('points to Settings while the search index is off, from the switch or from the app', () => {
    expect(deskLine(app(status({ phase: 'notSetUp' }), { indexOn: false }))).toMatchObject({ message: 'indexOff', action: 'openSettings' });
    expect(deskLine(app(status({ phase: 'off' })))).toMatchObject({ message: 'indexOff', action: 'openSettings' });
  });

  it('draws nothing until the app has answered', () => {
    expect(deskLine(app(null))).toBeNull();
  });

  it('waits its turn with Stop and no ring', () => {
    expect(deskLine(app(status({ phase: 'waitingTurn', filesTotal: 2000 })))).toMatchObject({ message: 'waitingTurn', action: 'stop', progress: null });
  });

  it('draws the download by bytes with Stop', () => {
    const downloading = deskLine(app(status({ phase: 'modelDownloading', model: { doneBytes: 500, totalBytes: 2000 } })));
    expect(downloading).toMatchObject({ message: 'modelDownloading', action: 'stop', progress: { measure: 'bytes', done: 500, total: 2000, fraction: 0.25 } });
    expect(deskLine(app(status({ phase: 'modelDownloading', model: { doneBytes: 0, totalBytes: 0 } })))?.progress).toMatchObject({ fraction: 0 });
  });

  it('holds the ring while the model is converted', () => {
    expect(deskLine(app(status({ phase: 'modelConverting' })))).toMatchObject({ message: 'modelConverting', progress: 'hold', action: 'stop' });
  });

  it('draws preparing by files, names the file and gives no minutes before a rate is measured', () => {
    expect(deskLine(app(PREPARING))).toMatchObject({
      message: 'preparing', action: 'stop', readingPath: 'wiki/architecture.md', minutesLeft: null,
      progress: { measure: 'files', done: 312, total: 2000, fraction: 0.156 },
    });
  });

  it('rounds minutes left up from the passages remaining and the measured rate', () => {
    // 3,780 passages at 11.9 a second are 5.29 minutes.
    expect(deskLine(app({ ...PREPARING, passagesDone: 6020, passagesPerSecond: 11.9 }))?.minutesLeft).toBe(6);
    expect(deskLine(app({ ...PREPARING, passagesDone: 9800, passagesPerSecond: 11.9 }))?.minutesLeft).toBe(0);
    expect(deskLine(app({ ...PREPARING, passagesPerSecond: 0 }))?.minutesLeft).toBeNull();
  });

  it('says an update under ten files quietly, only while changed files remain, and ready after', () => {
    // An update counts the changed files alone.
    const updating = status({ phase: 'preparing', updating: true, filesDone: 6, filesTotal: 9, currentPath: 'wiki/a.md' });
    expect(deskLine(app(updating))).toMatchObject({ message: 'updating', values: { count: 3 }, action: null, progress: null, readingPath: null });
    expect(deskLine(app({ ...updating, filesDone: 9 }))).toMatchObject({ message: 'ready', values: { files: 9 } });
  });

  it('follows an update of ten files or more like a first preparation, with the ring, the file and Stop', () => {
    const updating = status({ phase: 'preparing', updating: true, filesDone: 4, filesTotal: 10, passagesDone: 20, passagesTotal: 50, passagesPerSecond: 0.25, currentPath: 'sources/notes/2026-04.md' });
    expect(deskLine(app(updating))).toMatchObject({
      message: 'updating', values: { count: 6 }, action: 'stop', readingPath: 'sources/notes/2026-04.md', minutesLeft: 2,
      progress: { measure: 'files', done: 4, total: 10, fraction: 0.4 },
    });
  });

  it('says where a stop left the files, with Resume', () => {
    expect(deskLine(app(STOPPED))).toMatchObject({ message: 'stopped', values: { done: 1240, total: 2000 }, action: 'resume' });
  });

  it('says ready with the file count and no press', () => {
    expect(deskLine(app(status({ phase: 'ready', filesDone: 2000, filesTotal: 2000 })))).toMatchObject({ message: 'ready', values: { files: 2000 }, action: null });
  });

  it.each<[VectorFailure, string, string, string]>([
    ['download', 'modelDownloadFailed', 'resume', 'warning'],
    ['diskShort', 'modelDownloadFailed', 'setup', 'danger'],
    ['modelCheck', 'modelCheckFailed', 'downloadAgain', 'danger'],
    ['needsDirect', 'modelNeedsDirect', 'resume', 'warning'],
    ['modelGone', 'modelGone', 'downloadAgain', 'warning'],
    ['modelFailed', 'modelFailed', 'resume', 'warning'],
    ['runnerDown', 'runnerDown', 'resume', 'warning'],
    ['modelMissing', 'modelMissing', 'resume', 'warning'],
    ['write', 'writeFailed', 'resume', 'danger'],
    ['auditBlocked', 'auditBlocked', 'resume', 'danger'],
    ['unreadable', 'unreadable', 'resume', 'danger'],
  ])('says %s with its sentence and press, before and after work was kept', (failure, message, action, tone) => {
    for (const phase of ['failed', 'stopped'] as const) {
      expect(deskLine(app(status({ ...STOPPED, phase, failure, failureDetail: 'embed-request-failed' }), { runnerModel: 'bge-m3:latest' })))
        .toMatchObject({ message, action, tone, progress: null });
    }
  });

  it('passes the coded detail and the runner model to the sentences that name them', () => {
    expect(deskLine(app(status({ phase: 'failed', failure: 'download', failureDetail: 'embed-timed-out' })))?.values).toEqual({ detail: 'embed-timed-out' });
    expect(deskLine(app(status({ phase: 'failed', failure: 'modelMissing' }), { runnerModel: 'bge-m3:latest' }))?.values).toEqual({ model: 'bge-m3:latest' });
  });
});
