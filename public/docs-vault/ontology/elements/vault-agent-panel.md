---
slug: elements/vault-agent-panel
kind: element
title: Vault Agent Panel
domain: domains/agent-integration
path: src/widgets/vault-agent-panel
created_by: "agent:unknown"
---

에이전트 연결 상태와 실제 도구 읽기, 감사 기록, timeout 및 필수 읽기 실패를 보여주는 패널 위젯. 읽힌 manifest 없이 절대 경로만 복원된 상태는 기존 no-folder 잠금으로 강등하여 번들 샘플 화면과 숨은 로컬 본문·감사 로그가 갈라지지 않게 한다. 근거 읽기를 생략한 로컬 모델에는 한 번 교정하고, 두 번째에도 생략하면 답을 표시하지 않는다. capabilities/vault-agent의 사람 판정 표면이며, 구현은 src/widgets/vault-agent-panel과 src/features/vault-agent/model에 걸친다.
