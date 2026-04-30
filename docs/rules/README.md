# Rules Package

프로젝트 작업에 적용되는 규율 모음. 작업 전 해당 규칙을 먼저 확인한다.

| 파일 | 내용 |
|---|---|
| [`architecture-fsd.md`](architecture-fsd.md) | FSD 레이어 규칙, import 방향, 슬라이스 Public API |
| [`git-workflow.md`](git-workflow.md) | 브랜치 생성·커밋·merge 규칙 |
| [`naming.md`](naming.md) | 파일·변수·컴포넌트 네이밍 컨벤션 |
| [`firestore-schema.md`](firestore-schema.md) | 스키마 변경 프로세스 |
| [`documentation.md`](documentation.md) | 문서 유지 규칙 |

## 원칙

- 규칙 변경 시 이 폴더의 관련 파일 + `CLAUDE.md` 링크 일관성 확인
- 규칙이 깨진 경우 린트·CI·리뷰어 중 누군가가 반드시 잡아야 함
- 규칙 자체도 문서로 기록되어 있지 않으면 실제로 지켜지지 않는다
