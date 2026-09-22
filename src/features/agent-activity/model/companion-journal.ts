/** Personal reflections, never ontology truth or evidence of a completed review. */
export const COMPANION_STORAGE_KEY = 'ontology-atlas:companion-journal:v1';
export const MEMORY_LIMIT = 50;
export const MEMORY_KINDS = ['checked', 'corrected', 'uncertain'] as const;
export const KEEPSAKES = ['book', 'plant', 'star'] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export type Keepsake = typeof KEEPSAKES[number];
export type CompanionMemory = {
  id: string;
  kind: MemoryKind;
  keepsake: Keepsake;
  note: string;
  folder: string;
  createdAt: number;
};
export type CompanionJournal = { version: 1; memories: CompanionMemory[] };
export const EMPTY_JOURNAL: CompanionJournal = { version: 1, memories: [] };

export function parseCompanionJournal(raw: string | null): CompanionJournal | null {
  if (raw === null) return EMPTY_JOURNAL;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.memories) || value.memories.length > MEMORY_LIMIT) return null;
    const ids = new Set<string>();
    for (const memory of value.memories) {
      if (!memory || typeof memory.id !== 'string' || !memory.id || ids.has(memory.id)
        || !MEMORY_KINDS.includes(memory.kind) || !KEEPSAKES.includes(memory.keepsake)
        || typeof memory.note !== 'string' || !memory.note.trim() || memory.note.length > 240
        || typeof memory.folder !== 'string' || memory.folder.length > 160
        || !Number.isFinite(memory.createdAt) || memory.createdAt < 0) return null;
      ids.add(memory.id);
    }
    return value as CompanionJournal;
  } catch {
    return null;
  }
}

export function appendCompanionMemory(journal: CompanionJournal, memory: CompanionMemory): CompanionJournal | null {
  const next: CompanionJournal = { version: 1, memories: [memory, ...journal.memories] };
  // A full journal asks the person to remove a memory; it never silently evicts one.
  return parseCompanionJournal(JSON.stringify(next));
}
