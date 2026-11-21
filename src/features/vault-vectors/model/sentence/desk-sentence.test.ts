import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import ja from '../../../../../messages/ja.json';
import ko from '../../../../../messages/ko.json';
import zh from '../../../../../messages/zh.json';
import { OFF_VECTOR_STATUS, type VectorFailure } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { deskLine } from '../desk-line';
import { deskSentence } from './desk-sentence';

const catalogues = { en, ko, ja, zh } as const;
const FAILURES: VectorFailure[] = ['download', 'modelCheck', 'needsDirect', 'diskShort', 'modelGone', 'modelFailed', 'write', 'auditBlocked', 'unreadable', 'runnerDown', 'modelMissing'];
const KEPT = { doneBytes: 412_000_000, totalBytes: 2_288_243_938, checking: false };

const english = () => createTranslator({ locale: 'en', messages: en, namespace: 'library.questionDesk.meaning' });
const failedLine = (failure: VectorFailure, failureDetail: string | null, model: typeof KEPT | null = null) => deskLine({
  status: { ...OFF_VECTOR_STATUS, phase: 'failed', failure, failureDetail, model },
  isApp: true, indexOn: true, markdownFiles: 10, runnerModel: 'bge-m3:latest',
})!;

describe('the sentence the desk line says', () => {
  it.each(Object.keys(catalogues) as Array<keyof typeof catalogues>)('%s says every failure with no missing value', (locale) => {
    const onError = vi.fn();
    const t = createTranslator({ locale, messages: catalogues[locale], namespace: 'library.questionDesk.meaning', onError });
    for (const failure of FAILURES) {
      for (const model of [null, KEPT]) {
        const sentence = deskSentence(t, locale, failedLine(failure, 'embed-model-not-ready', model));
        expect(sentence, failure).not.toMatch(/[{}]|questionDesk/u);
      }
    }
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ['convert', 'the model could not be prepared for this computer'],
    ['check', 'the prepared model did not pass its check'],
    ['timed-out', 'it did not answer in time'],
    ['internal', 'Atlas met an internal error'],
  ])('names the cause of a model that could not run (%s)', (detail, cause) => {
    const sentence = deskSentence(english(), 'en', failedLine('modelFailed', detail));
    expect(sentence).toBe(`The model could not run on this computer: ${cause}.`);
  });

  it('names what a cut-off download kept', () => {
    expect(deskSentence(english(), 'en', failedLine('modelGone', null, KEPT))).toContain('412 MB of 2.3 GB');
  });

  it('counts a working line from the ring it draws, and nothing without one', () => {
    const preparing = { message: 'preparing', values: {} } as const;
    expect(deskSentence(english(), 'en', preparing, { done: 312.6, total: 2000 })).toBe('Preparing search by meaning · 312 of 2,000 files');
    expect(deskSentence(english(), 'en', { message: 'modelDownloading', values: {} }, { done: 500, total: 2000 })).toContain('25%');
    expect(deskSentence(english(), 'en', { message: 'modelDownloading', values: {} })).toContain('0%');
  });
});
