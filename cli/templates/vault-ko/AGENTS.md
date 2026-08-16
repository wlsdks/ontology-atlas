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

**쓸 때도 같은 서버로** — `add_concept` · `add_relation` · `patch_concept`
(`expected_mtime` 을 함께) · `rename_concept` · `merge_concepts`.
손으로 만든 파일은 `uid:` 가 없고, `uid:` 하나가 없으면 그래프 전체가
컴파일에 실패합니다.
