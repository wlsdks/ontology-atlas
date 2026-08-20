export { AppSettingsMenu } from './ui/AppSettingsMenu';
export type { AppSettingsMenuProps, AppSettingsScreenControls } from './ui/AppSettingsMenu';

/**
 * 「에이전트」 목적지가 이 칸을 그대로 쓴다 (2026-08-20, 원장 90).
 *
 * ⚠️ **부품이 시트 밖으로 나가면 시트의 치수를 안고 나가면 안 된다.** 이 칸은
 * `SettingsGroup`/`SettingsRow` 위에 서 있고 그 둘은 폭을 스스로 정하지 않으므로
 * (부모가 준 폭을 채운다) 목적지의 `PAGE_FRAME` 아래에서도 그대로 선다.
 */
export { AcpRuntimeSettings } from './ui/AcpRuntimeSettings';

/** 「MCP 연결」 칸 — 목적지와 설정 시트가 같이 쓴다(위 주석과 같은 이유). */
export { AgentSetupSection } from './ui/AgentSetupSection';
