interface ChatDraft {
  text: string;
  prefillNonce: number | null;
}

const routeDrafts = new WeakMap<object, ChatDraft>();

// Prototype methods keep the production minifier from lifting draft closures
// into the dock's render scope, which would retain the previous vault snapshot.
class ChatDraftStore {
  private current: ChatDraft;

  constructor(private readonly scope: object | null) {
    this.current = (scope ? routeDrafts.get(scope) : undefined) ?? { text: '', prefillNonce: null };
  }

  read() {
    return { ...this.current };
  }

  write(draft: ChatDraft) {
    this.current = { ...draft };
    if (!this.scope) return;
    // Prepared requests need their originating review and source guards.
    if (draft.prefillNonce !== null || !draft.text) routeDrafts.delete(this.scope);
    else routeDrafts.set(this.scope, this.current);
  }
}

export function createChatDraftStore(scope: object | null) {
  return new ChatDraftStore(scope);
}

export type ChatDraftPresence = { key: string; seen: boolean; retired: boolean } | null;

export function reportChatDraftPresence(
  store: Pick<ChatDraftStore, 'read'>,
  key: string,
  setPresence: (update: (current: ChatDraftPresence) => ChatDraftPresence) => void,
  present: boolean,
) {
  const hasDraft = present || store.read().text.trim().length > 0;
  setPresence((current) => {
    if (current?.key !== key) return { key, seen: hasDraft, retired: false };
    return { ...current, seen: current.seen || hasDraft, retired: current.retired || (!hasDraft && current.seen) };
  });
}
