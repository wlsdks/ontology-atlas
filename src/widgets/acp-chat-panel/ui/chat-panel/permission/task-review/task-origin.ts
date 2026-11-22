/** Where a request came from: the user message that started the task, its outcome, and the session it ran in. */
export interface TaskOrigin {
  userEventId: string;
  outcome: string;
  sessionGeneration: number;
}
