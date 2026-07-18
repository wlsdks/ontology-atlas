/**
 * FirstRun "새 볼트 만들기" 카드의 결정 로직 — 순수 함수로 분리해 테스트.
 *
 * 별도의 "create" 파이프라인을 만들지 않는다. 기존 open() (폴더 선택) 뒤에
 * 기존 scaffoldOntology() (starter 5 md + agent config 시드, `/docs` 의
 * OntologyStarterCta 와 동일 액션) 를 잇는 조합일 뿐 — 단일 진실원 유지.
 */
export function shouldScaffoldAfterOpen(args: {
  /** 사용자가 "새 볼트 만들기" 카드로 open 을 시작했는가. */
  createIntent: boolean;
  /** useLocalVault().status */
  status: string;
  /** 열린 manifest 의 doc 수. manifest 없으면 null. */
  docCount: number | null;
}): boolean {
  return args.createIntent && args.status === 'loaded' && args.docCount === 0;
}

/**
 * create intent 를 접어야 하는 시점 — open 이 끝(성공/취소/실패)났을 때.
 * 'opening' / 'loading' 동안만 intent 유지.
 */
export function shouldClearCreateIntent(status: string): boolean {
  return status !== 'opening' && status !== 'loading';
}
