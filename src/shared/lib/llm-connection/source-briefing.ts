import { invoke, isTauri } from '@tauri-apps/api/core';
import { invokeCancellable } from '../desktop-shell/cancellable-request';
import type { LlmChatEcho } from './tauri-llm';

export interface SourceModelCapacity { inputByteLimit: number; contextTokens: number }
export async function sourceModelCapacity(baseUrl: string, model: string): Promise<SourceModelCapacity | null> {
  return typeof window !== 'undefined' && isTauri() ? invoke('source_model_capacity', { baseUrl, model }) : null;
}
export async function analyseSourceBriefing(input: { sourcePath: string; head: string; snapshot: string; baseUrl: string; model: string; locale: string; packet: string; expectedCapacity: SourceModelCapacity }, signal: AbortSignal): Promise<LlmChatEcho> {
  return invokeCancellable('source_briefing_chat', input, signal);
}
