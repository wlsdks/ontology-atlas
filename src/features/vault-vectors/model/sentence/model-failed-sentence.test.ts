import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../../../messages/en.json';
import ja from '../../../../../messages/ja.json';
import ko from '../../../../../messages/ko.json';
import zh from '../../../../../messages/zh.json';
import { MODEL_FAILED_DETAILS } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { modelFailedSentence } from './model-failed-sentence';

const catalogues = { en, ko, ja, zh } as const;

describe('the sentence for a model that could not run', () => {
  it.each(Object.keys(catalogues) as Array<keyof typeof catalogues>)('%s says each of the six details in its own words and never prints a code', (locale) => {
    const t = createTranslator({ locale, messages: catalogues[locale], namespace: 'library.questionDesk.meaning' });
    const sentences = MODEL_FAILED_DETAILS.map((detail) => modelFailedSentence(t, detail));
    expect(new Set(sentences).size).toBe(MODEL_FAILED_DETAILS.length);
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/worker[-_]exited|timed[-_]out|[{}]/u);
      expect(sentence).not.toBe(t('modelFailedGeneric'));
    }
    for (const other of ['worker-exited-in-convert', 'embed-model-load-failed', '', null]) {
      expect(modelFailedSentence(t, other)).toBe(t('modelFailedGeneric'));
    }
  });
});
