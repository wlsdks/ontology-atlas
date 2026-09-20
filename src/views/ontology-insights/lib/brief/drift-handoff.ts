import type { BriefLineDetail } from './brief-model';

/** How many concepts one request may name. Beyond this the agent is reading, not checking. */
const DRIFT_HANDOFF_LIMIT = 5;

/**
 * **The request a person hands their agent about drifted meaning.**
 *
 * The brief can name which concepts stand on code that moved; the work of judging whether
 * the recorded meaning is now wrong is reading, and that is what a coding agent is for. So
 * the line offers one bounded request naming the exact concepts, the exact files, and both
 * dates — the same facts the screen shows, in the words the agent will need.
 *
 * It asks for a judgement and an explicit proposal, never a write: Atlas writes pause on the
 * typed review card, and a request that told an agent to "fix the vault" would be asking for
 * approval the person has not given. The person owns Send; nothing here submits.
 */
export function buildDriftHandoff({
  rows,
  locale,
  limit = DRIFT_HANDOFF_LIMIT,
}: {
  rows: readonly BriefLineDetail[];
  locale: string;
  limit?: number;
}): string | null {
  if (rows.length === 0) return null;
  const named = rows.slice(0, limit);
  const hidden = rows.length - named.length;
  const ko = locale === 'ko';
  /*
   * ⚠️ **The slug, because that is what the tool takes.** The request told the agent to read the
   * recorded meaning with `get_concept` and then named the concept by its display title, which
   * `get_concept` does not accept — the agent had to go looking for the document before it could
   * read anything (2026-09-20). The walk already knew the slug; carrying it turns the request into
   * calls the agent can make. A concept with no document of its own has no slug, and the request
   * says so rather than inventing one.
   */
  const identify = (row: (typeof named)[number]) =>
    row.slug ? `${row.name} (${row.slug})` : row.name;
  const lines = named.map((row) =>
    ko
      ? `- ${identify(row)} — 근거 파일 ${row.path} 가 ${row.at ?? '알 수 없는 때'} 에 바뀌었고, 개념 문서는 ${row.docAt ?? '기록 없음'} 이후로 그대로다.`
      : `- ${identify(row)} — its evidence file ${row.path} changed at ${row.at ?? 'an unrecorded time'}, while the concept document has stood since ${row.docAt ?? 'an unrecorded time'}.`,
  );
  const tail = hidden > 0
    ? [ko ? `- 같은 상태의 개념이 ${hidden}개 더 있다. 이번에는 위 ${named.length}개만 판단해줘.` : `- ${hidden} more concepts are in the same state. Judge only the ${named.length} above this time.`]
    : [];
  return (ko
    ? [
        '이 폴더에서 기록된 의미보다 그 근거 코드가 나중에 바뀐 개념들이야.',
        '',
        ...lines,
        ...tail,
        '',
        '각 개념에 대해: 괄호 안 슬러그로 get_concept 을 불러 기록된 의미를 읽고, 위 근거 파일의 현재 내용을 읽어.',
        '슬러그가 없는 줄은 자기 문서가 없는 개념이니, 그 이름을 적어 둔 문서부터 찾아.',
        '그다음 기록된 의미가 아직 맞는지, 좁아졌는지, 틀렸는지 한 문장으로 판단하고 근거 줄을 인용해.',
        '틀렸다면 고쳐야 할 문장을 제안만 해. 볼트를 직접 바꾸지 말고, 판단할 수 없으면 모른다고 말해.',
      ]
    : [
        'These concepts in this folder stand on code that changed after their recorded meaning.',
        '',
        ...lines,
        ...tail,
        '',
        'For each: call get_concept with the slug in brackets to read the recorded meaning, then read the current contents of the evidence file above.',
        'A line with no slug is a concept that owns no document, so start from whichever document wrote its name down.',
        'Then judge in one sentence whether the recorded meaning still holds, has narrowed, or is now wrong, and quote the lines you judged from.',
        'If it is wrong, propose the sentence to change. Do not write to the vault, and say so plainly when you cannot tell.',
      ]
  ).join('\n');
}
