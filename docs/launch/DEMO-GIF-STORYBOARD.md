# 30s Demo GIF — storyboard

README 첫 화면에 박을 30초 GIF / mp4 의 스토리보드. **claim → proof** 5
컷 시퀀스. 각 컷 ~6초.

## Cut 1 (0–6s) — "AI 와 사람이 같은 vault 를 편집"

- **screen**: 좌측 vscode (또는 Obsidian) 가 `domains/auth.md` 를 열어 frontmatter 보임. 우측 Claude Code terminal 에서 `ontology-atlas` 도구 호출 결과 표시.
- **action**: 사람이 markdown 의 `capabilities:` 키에 `capabilities/login` 추가 → 저장. AI 가 같은 vault 의 `capabilities/login.md` 를 `add_concept` 로 생성.
- **caption**: `humans + AI agents author the same vault`

## Cut 2 (6–12s) — "frontmatter 가 곧 그래프"

- **screen**: 설치된 Ontology Atlas macOS 앱에서 위 vault 폴더를 `/docs` picker 로 열면 즉시 트리·토폴로지·ERD 에 노드 / 엣지 표시.
- **action**: 워크벤치 좌측 트리에서 `domains/auth` 클릭 → 우측 detail 패널에 frontmatter 그대로.
- **caption**: `frontmatter is the graph`

## Cut 3 (12–18s) — "토폴로지 view"

- **screen**: `/topology` Sigma WebGL — current dogfood vault (101 노드) drag / hover.
- **action**: 사용자가 한 노드 hover → 1-hop 이웃 강조 → 클릭 → ProjectDrawer.
- **caption**: `Sigma topology · 1 click → context`

## Cut 4 (18–24s) — "AI agent 가 ontology 를 *읽고* 코드 제안"

- **screen**: Claude Code 가 `find_path` 로 두 capability 사이 의존 chain 조회 → "이 변경은 capabilities/login → elements/jwt-token 영향" 같은 답.
- **action**: 사용자가 "auth refactor 영향 범위 알려줘" 질문 → AI 가 ontology 의존성 트리 기반 답변.
- **caption**: `AI reads the ontology before suggesting code`

## Cut 5 (24–30s) — "30 초 setup"

- **screen**: terminal `npx ontology-atlas init my-vault` 실행 → starter 파일들과 `.mcp.json` 생성 → "Next steps:" 안내 표시.
- **action**: 사용자가 vault 폴더로 cd 한 후 끝.
- **caption**: `npx ontology-atlas init my-vault — 30 seconds, you're in`

## 녹화 환경

- **OS**: macOS (사용자 본 환경)
- **앱**: 설치된 macOS desktop app 1280×800 window (가독성)
- **terminal**: 다크 테마, 14pt 이상
- **vscode/obsidian**: 다크 테마, 동일 폰트 사이즈
- **녹화 도구**: `kap.app` (.gif export, 12fps, ~5 MB) 또는 OBS → ffmpeg
- **resolution**: 1280×720 (GitHub README 임베드 친화)
- **filesize**: < 8 MB (GitHub markdown 의 inline 임베드 한계)

## README 임베드

```markdown
![ontology-atlas demo](docs/launch/demo.gif)
```

또는 Vercel hosted demo 의 한 surface 만 짧게:

```markdown
![Topology view](docs/launch/topology-30s.gif)
```

## 대안: 이미지 4 개 grid

GIF 없이 정적 이미지 4 개로 같은 메시지 전달 가능:
1. terminal `npx init` 결과
2. workbench `/topology`
3. workbench `/ontology` (트리)
4. Claude Code MCP tool 호출 결과

각 PNG 는 ~ 200 KB 수준. README markdown table 로 grid 배치.
