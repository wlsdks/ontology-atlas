export const VOCABULARY = {
  folderSecondNames: {
    applies: ['ko'],
    notApplicable: {
      ja: "the glossary fixes フォルダ as the only name for the person's folder; no second name existed to ban",
      zh: "the glossary fixes 文件夹 as the only name for the person's folder; no second name existed to ban",
    },
    ko: {
      words: ['볼트', '워크스페이스', 'vault'],
      identifier: /(?:pnpm\s+[a-z:-]*vault[a-z:-]*|[a-z_]*vault[a-z_]*\s*\(|validate_vault|workspace_brief)/i,
    },
  },
  rendererName: {
    applies: ['ko'],
    notApplicable: {
      ja: 'マップ is the only name for the map screen in the glossary; no loanword variant exists to ban',
      zh: '地图 is the only name for the map screen in the glossary; no loanword variant exists to ban',
    },
    ko: { words: ['토폴로지'] },
  },
  aiWord: {
    applies: ['ko'],
    notApplicable: {
      ja: 'the baseline counts a Korean wording of AI that the ja catalog never had',
      zh: 'the baseline counts a Korean wording of AI that the zh catalog never had',
    },
    ko: { word: 'AI', baseline: 82 },
  },
  projectKindWord: {
    applies: ['ko'],
    notApplicable: {
      ja: 'the baseline counts a Korean overload of the project word; プロジェクト is one term in the glossary',
      zh: 'the baseline counts a Korean overload of the project word; 项目 is one term in the glossary',
    },
    ko: { word: '프로젝트', baseline: 144 },
  },
  softenedKindNames: {
    applies: ['ko'],
    notApplicable: {
      ja: 'the Korean list names softened labels for kinds; the glossary gives ja one fixed name per kind',
      zh: 'the Korean list names softened labels for kinds; the glossary gives zh one fixed name per kind',
    },
    ko: { baselines: { 영역: 14, 기능: 7 } },
  },
  nodeWord: {
    applies: ['ko', 'en'],
    notApplicable: {
      ja: 'the glossary writes 概念 and never lists ノード as a candidate; no ratchet has been measured for ja',
      zh: 'the glossary writes 概念 and never lists 节点 as a candidate; no ratchet has been measured for zh',
    },
    ko: { banned: ['노드'] },
    en: { pattern: /\bnodes?\b/i, ignore: /\{nodes\}/g, baseline: 9 },
  },
  internalTerms: {
    applies: ['ko'],
    notApplicable: {
      ja: 'the list is Korean team jargon that leaked into labels; ja has no measured leak',
      zh: 'the list is Korean team jargon that leaked into labels; zh has no measured leak',
    },
    ko: {
      terms: [
        { term: '인계문', tolerated: [], inLabels: true },
        { term: '핸드오프', tolerated: [], inLabels: true },
        { term: '담는 것', tolerated: [], inLabels: true },
        { term: '속한 곳', tolerated: [], inLabels: true },
        { term: '기대는 곳', tolerated: [], inLabels: true },
        { term: '이것만 보기', tolerated: [], inLabels: true },
        { term: '전체 상세', tolerated: [], inLabels: true },
        { term: '수리 큐', tolerated: [] },
        { term: '정본', tolerated: [] },
        { term: '관문', tolerated: [] },
        { term: '래칫', tolerated: [] },
        { term: '게이트', tolerated: [] },
        { term: '계약', not: /계약서/, tolerated: [] },
        { term: '영수증', tolerated: [] },
        { term: '위반', tolerated: [] },
        { term: '미분류 의존', tolerated: [] },
        { term: '원소', tolerated: [] },
      ],
    },
  },
  ownScript: {
    applies: ['ko'],
    notApplicable: {
      ja: 'ownScript is a Hangul test; the ja and zh script checks live in check-translation-coverage typography rules',
      zh: 'ownScript is a Hangul test; the ja and zh script checks live in check-translation-coverage typography rules',
    },
    ko: { pattern: /[가-힣]/ },
  },
  untranslatedEnglish: {
    applies: ['ko'],
    notApplicable: {
      ja: 'check-translation-coverage owns the residue check for ja with its ACCEPTED table',
      zh: 'check-translation-coverage owns the residue check for zh with its ACCEPTED table',
    },
    ko: {
      intentional: {
        'metadata.siteName': "the product's name",
        'projectPages.detail.documentTitleSuffix': "the product's name",
        'architecture.patternLabels.feature-sliced-design': "the architecture pattern's own name",
        'footer.license': "the licence's own name",
        'footer.stack': "technology names",
        'download.trustVerifyCommand': "a command the person types",
        'download.trustVerifyCommandWindows': "a command the person types (PowerShell)",
        'download.factSourceValue': "the repository's own name (owner/repo)",
        'projectPages.selector.nextSlotCliCommand': "a command the person types",
        'projectPages.selector.nextSlotAgentCommand': "an MCP call signature an agent runs",
        'docsVault.agentSetup.connectionClaudeCursor': "product names",
        'agentConnect.claudeCode': "a product name and a file name",
        'settings.projectForm.fields.linksPlaceholder': "example URLs",
        'settings.projectForm.fields.stackPlaceholder': "technology names",
        'settings.projectForm.fields.tagsPlaceholder': "example tags",
        'agents.models.providerGemini': "a product name",
        'agents.models.localBaseUrlPlaceholder': "a URL",
        'agents.models.runnerLmStudio': "a product name",
        'agents.models.runnerLlamaCpp': "a product name",
        'download.heroMacSilicon': "Apple's own chip name, the row beside it reads Intel",
        'library.rounds.sheet.wherePlaceholder': "example locations, spelled the way each service spells them",
        'agents.models.keysTitle': "a term kept as developers say it; the TermHint beside it carries the explanation",
        'agents.models.keyLabel': "a term kept as developers say it; the TermHint beside it carries the explanation",
        'agents.models.jev.keyLabel': "a term kept as developers say it; the TermHint beside it carries the explanation",
        'termHints.mcp.expansion': "a term kept as developers say it; the TermHint beside it carries the explanation",
        'termHints.acp.expansion': "a term kept as developers say it; the TermHint beside it carries the explanation",
        'termHints.apiKey.expansion': "a term kept as developers say it; the TermHint beside it carries the explanation",
        'termHints.cli.expansion': "a term kept as developers say it; the TermHint beside it carries the explanation",
      },
      baseline: ['firstRun.eyebrow', 'settings.projectForm.fields.nameEnPlaceholder'],
    },
  },
  codeStyleWords: {
    applies: ['ko'],
    notApplicable: {
      ja: 'the list holds Korean loanwords for developer terms; ja wording is governed by GLOSSARY-LOCK and the coverage keep-terms',
      zh: 'the list holds Korean loanwords for developer terms; zh wording is governed by GLOSSARY-LOCK and the coverage keep-terms',
    },
    ko: {
      words: [
        { word: /frontmatter/i, use: '파일 맨 위 정보칸 / the info block at the top', parenthesizedOk: true },
        { word: /프론트매터/, use: '파일 맨 위 정보칸' },
        { word: /문서 상단 속성|문서 속성/, use: '파일 맨 위 정보칸 — 같은 것을 세 이름으로 부르고 있었다' },
        { word: /엣지/, use: '연결' },
        { word: /렌더링/, use: '화면에 그리다' },
        { word: /파싱/, use: '읽어 들이다' },
        { word: /쿼리/, use: '검색어' },
        { word: /메타데이터/, use: '기본 정보' },
        { word: /(^|[^가-힣])인덱스/, use: '검색 준비' },
      ],
    },
  },
  surfaceNaming: {
    applies: ['ko', 'en'],
    notApplicable: {
      ja: 'the ratchet compares ko and en counts of the word browser; ja has not been baselined against en',
      zh: 'the ratchet compares ko and en counts of the word browser; zh has not been baselined against en',
    },
    fallback: 25,
    ko: { pattern: /브라우저|browser/i },
    en: { pattern: /브라우저|browser/i },
  },
  installedApp: {
    applies: ['ko', 'en', 'ja', 'zh'],
    ko: { all: [/설치(된|해)/, /앱/] },
    ja: { all: [/インストール/, /アプリ/] },
    zh: { all: [/安装/, /应用/] },
    en: { all: [/installed|install the/i, /app/i] },
  },
  folderWord: {
    applies: ['ko', 'en', 'ja', 'zh'],
    ko: { pattern: /폴더/ },
    ja: { pattern: /フォルダ/ },
    zh: { pattern: /文件夹/ },
    en: { pattern: /folder/i },
  },
};

export function concept(id, table = VOCABULARY) {
  const entry = table[id];
  if (!entry) throw new Error(`unknown vocabulary concept "${id}"`);
  return entry;
}

export function appliesTo(id, locale, table = VOCABULARY) {
  return concept(id, table).applies.includes(locale);
}

export function column(id, locale, table = VOCABULARY) {
  const entry = concept(id, table);
  if (!entry.applies.includes(locale) || !entry[locale]) {
    throw new Error(`vocabulary concept "${id}" has no column for "${locale}"`);
  }
  return entry[locale];
}

export function matches(id, locale, text, table = VOCABULARY) {
  return column(id, locale, table).pattern.test(text);
}

export function matchesAll(id, locale, text, table = VOCABULARY) {
  return column(id, locale, table).all.every((pattern) => pattern.test(text));
}

export function missingColumns(locales, table = VOCABULARY) {
  const gaps = [];
  for (const [id, entry] of Object.entries(table)) {
    for (const locale of locales) {
      if (locale === 'en') continue;
      const reason = entry.notApplicable?.[locale];
      if (reason !== undefined) {
        if (typeof reason !== 'string' || reason.trim() === '' || entry.applies.includes(locale)) {
          gaps.push(`${id}:${locale} notApplicable needs a reason and must not also apply`);
        }
      } else if (!entry.applies.includes(locale)) {
        gaps.push(`${id}:${locale} has no column and no notApplicable reason`);
      } else if (!entry[locale]) {
        gaps.push(`${id}:${locale} applies but holds no forms`);
      }
    }
  }
  return gaps;
}
