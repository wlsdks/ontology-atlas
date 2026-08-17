# 이 폴더는 Ontology Atlas 볼트입니다

각 `.md` 의 frontmatter 가 그래프의 노드와 엣지입니다. 파일을 훑기 전에
**MCP 서버 `ontology-atlas` 를 먼저 부르세요.** 이 폴더에 이미 등록돼 있고
(`.mcp.json`, `.codex/config.toml`), 파싱·검증·관계 해석이 끝난 답을 줍니다.

| 알고 싶은 것 | 첫 호출 |
|---|---|
| 뭐가 몇 개 있나 | `list_kinds` |
| 개념 목록 전체 | `list_concepts` |
| 한 개념과 그 이웃 | `get_concept({ slug })` |
| 이걸 쓰는 곳 | `find_backlinks(slug)` |
| 두 개념이 이어져 있나 | `find_path(from, to)` |
| 이 볼트가 성한가 | `validate_vault({})` |

`grep` 이나 `sed` 로 frontmatter 를 직접 읽지 마세요. 같은 답을 더 느리게 얻고,
관계 해석과 스키마 검증이 빠집니다.

**이름은 이 볼트가 이미 쓰는 방식대로.** `title` 은 검색이 기준으로 삼는 단
하나의 정본 이름이고, 다른 언어 이름은 `display_ko` / `display_en` 에 넣습니다.
이 폴더의 노드는 전부 `title` 을 영어로 두므로, `title` 에 `display_ko` 와 같은
값을 쓰면 한 볼트 안에 정본 이름의 언어가 섞여 검색이 갈립니다.

**쓸 때도 같은 서버로** — `add_concept` · `add_relation` · `patch_concept`
(`expected_mtime` 을 함께) · `rename_concept` · `merge_concepts`.
손으로 만든 파일은 `uid:` 가 없고, `uid:` 하나가 없으면 그래프 전체가
컴파일에 실패합니다.
