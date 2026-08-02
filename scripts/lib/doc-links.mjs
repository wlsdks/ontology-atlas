// 깨진 링크 검사의 순수 부분.
//
// 이 저장소가 실제로 겪은 부패다 — 볼트를 재생성하면 노드 파일이 사라지는데,
// 그 파일을 인용하던 산문은 그대로 남는다. 3,419줄 · 단언 2,126개짜리 산문 핀
// 묶음은 이것을 한 건도 잡지 못했다(문장은 안 바뀌었으니까). 링크는 반대다 —
// **대상이 있는지 없는지는 기계가 판정할 수 있다.**

/** 링크 문법은 코드 펜스 안에서 예시로 등장한다 — 예시를 검사하면 거짓 양성이 된다. */
export function stripFencedBlocks(markdown) {
  const lines = markdown.split('\n');
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

/** 인라인 코드(`[a](b)` 를 문법 설명으로 적은 경우)도 링크가 아니다. */
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length));
}

export function collectMarkdownLinks(markdown) {
  const links = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const match of stripInlineCode(line).matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ line: index + 1, target: match[1] });
    }
  });
  return links;
}

/** GitHub README에서 쓰는 raw HTML picture/img 자산도 눌리지 않는 로컬 약속이다. */
export function collectHtmlAssetRefs(markdown) {
  const refs = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const tagMatch of line.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
      for (const attrMatch of tagMatch[0].matchAll(/\b(src|srcset)\s*=\s*(["'])(.*?)\2/gi)) {
        const [, attribute, , value] = attrMatch;
        const candidates = attribute.toLowerCase() === 'srcset' && !isExternalTarget(value)
          ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0])
          : [value.trim()];
        for (const target of candidates) {
          if (target && !isExternalTarget(target)) refs.push({ line: index + 1, target });
        }
      }
    }
  });
  return refs;
}

export function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

/**
 * 백틱 안의 저장소 경로 인용. 문장을 읽는 게 아니라 **경로 토큰**만 본다.
 *
 * 좁게 잡는 이유는 실측이다: 아무 백틱 경로나 다 보면 168건이 뜨는데 대부분
 * `domains/foo.md` 같은 볼트 상대 예시이거나 빌드 산출물이다. 저장소 루트에
 * 앵커된 `.md` 경로로 좁히면 232건 중 3건이 뜨고 **셋 다 진짜**였다.
 */
const REPO_TOP_LEVEL = new Set([
  'src',
  'app',
  'docs',
  'scripts',
  'cli',
  'mcp',
  'tests',
  'messages',
  'samples',
  '.claude',
  '.agents',
  '.codex',
  '.github',
]);

export function collectProseDocRefs(markdown) {
  const refs = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const match of line.matchAll(/`([^`\s]+\.md)`/g)) {
      const target = match[1];
      if (/[*?{}<>|[\]]/.test(target)) continue; // 글롭 · 플레이스홀더
      if (isExternalTarget(target)) continue;
      const relative = target.startsWith('./') || target.startsWith('../');
      if (!relative && !REPO_TOP_LEVEL.has(target.split('/')[0])) continue;
      refs.push({ line: index + 1, target, relative });
    }
  });
  return refs;
}

/**
 * 이력 문서는 **사라진 파일을 이름으로 부르는 것이 일**이다 — 변경 로그가
 * "`docs/GUIDE.md` 를 삭제했다" 고 쓰는 것은 부패가 아니라 기록이다. 그래서
 * 산문 경로 인용 검사는 여기서 빠진다(링크는 빠지지 않는다 — 링크는 이력
 * 문서에서도 눌렀을 때 열려야 하는 약속이다).
 *
 * 실측: 이 제외가 없으면 이력 문서에서만 24건이 떠서 현행 문서 3건을 덮는다.
 */
export function isHistoricalDoc(relativePath) {
  const normalized = relativePath.split('\\').join('/');
  return (
    /(^|\/)CHANGELOG\.md$/.test(normalized) ||
    normalized === 'docs/DECISIONS.md' ||
    /^docs\/(archive|audits|superpowers|plans|prototypes)\//.test(normalized) ||
    /^docs\/benchmark\/results\//.test(normalized)
  );
}
