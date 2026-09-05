import {
  ensureSidecarIgnore,
  isNotFoundError,
  VAULT_SIDECAR_DIR,
} from "./vault-sidecar";
import {
  deserializeProjectSourceState,
  serializeProjectSourceState,
  type ProjectSourceBinding,
  type ProjectSourceReceipt,
} from "./project-source-receipt";

export type ProjectSourceStoreReadResult =
  | { status: "ok"; bindings: ProjectSourceBinding[] }
  | { status: "missing" | "malformed" | "unavailable"; bindings: [] };

export interface ProjectSourceMedium {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

type ProjectSourceReplaceResult =
  | {
      status: "replaced";
      binding: ProjectSourceBinding;
      bindings: ProjectSourceBinding[];
    }
  | {
      status:
        | "blocked_malformed"
        | "blocked_unavailable"
        | "cancelled"
        | "measurement_failed"
        | "invalid_measurement"
        | "persistence_failed";
      bindings: ProjectSourceBinding[];
    };

export interface ProjectSourceStore {
  read(): Promise<ProjectSourceStoreReadResult>;
  list(projectSlug: string): Promise<ProjectSourceStoreReadResult>;
  replaceAfterMeasurement(
    projectSlug: string,
    pendingBinding: Omit<ProjectSourceBinding, "receipt">,
    buildReceipt: () => Promise<ProjectSourceReceipt>,
  ): Promise<ProjectSourceReplaceResult>;
}

export function createProjectSourceStore(medium: ProjectSourceMedium): ProjectSourceStore {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const readCurrent = async (): Promise<ProjectSourceStoreReadResult> => {
    let text: string | null;
    try {
      text = await medium.read();
    } catch {
      return { status: "unavailable", bindings: [] };
    }
    if (text === null) return { status: "missing", bindings: [] };
    const state = deserializeProjectSourceState(text);
    if (state.malformed) return { status: "malformed", bindings: [] };
    return { status: "ok", bindings: state.bindings };
  };

  const blockedResult = (
    result: ProjectSourceStoreReadResult,
  ): ProjectSourceReplaceResult | null => {
    if (result.status === "malformed") {
      return { status: "blocked_malformed", bindings: [] };
    }
    if (result.status === "unavailable") {
      return { status: "blocked_unavailable", bindings: [] };
    }
    return null;
  };

  const receiptMatchesBinding = (
    projectSlug: string,
    pendingBinding: Omit<ProjectSourceBinding, "receipt">,
    receipt: ProjectSourceReceipt,
  ) => (
    pendingBinding.projectSlug === projectSlug
    && receipt.projectSlug === projectSlug
    && receipt.sourceId === pendingBinding.sourceId
    && receipt.sourceKind === pendingBinding.kind
  );

  return {
    read: () => enqueue(readCurrent),
    list: (projectSlug) => enqueue(async () => {
      const result = await readCurrent();
      if (result.status !== "ok") return result;
      return {
        status: "ok",
        bindings: result.bindings.filter((binding) => binding.projectSlug === projectSlug),
      };
    }),
    replaceAfterMeasurement: async (projectSlug, pendingBinding, buildReceipt) => {
      const preflight = await enqueue(readCurrent);
      const preflightBlock = blockedResult(preflight);
      if (preflightBlock) return preflightBlock;

      let receipt: ProjectSourceReceipt;
      try {
        receipt = await buildReceipt();
      } catch (error) {
        return {
          status:
            error && typeof error === "object" && "name" in error && error.name === "AbortError"
              ? "cancelled"
              : "measurement_failed",
          bindings: preflight.status === "ok" ? preflight.bindings : [],
        };
      }
      if (!receiptMatchesBinding(projectSlug, pendingBinding, receipt)) {
        return {
          status: "invalid_measurement",
          bindings: preflight.status === "ok" ? preflight.bindings : [],
        };
      }

      return enqueue(async () => {
        // Measurement can take time. Re-read inside the serialized commit so
        // another project's completed measurement is never overwritten.
        const current = await readCurrent();
        const currentBlock = blockedResult(current);
        if (currentBlock) return currentBlock;
        const currentBindings = current.status === "ok" ? current.bindings : [];
        const binding: ProjectSourceBinding = { ...pendingBinding, receipt };
        const bindings = [
          ...currentBindings.filter((candidate) => candidate.projectSlug !== projectSlug),
          binding,
        ];
        try {
          await medium.write(serializeProjectSourceState({ bindings }));
        } catch {
          return { status: "persistence_failed", bindings: currentBindings };
        }
        return { status: "replaced", binding, bindings };
      });
    },
  };
}

export function createMemoryProjectSourceStore(seed: string | null = null): ProjectSourceStore {
  let text = seed;
  return createProjectSourceStore({
    read: async () => text,
    write: async (next) => {
      text = next;
    },
  });
}

export const PROJECT_SOURCES_VAULT_DIR = VAULT_SIDECAR_DIR;
export const PROJECT_SOURCES_VAULT_FILE = "project-sources.json";
export const PROJECT_SOURCES_RELATIVE_PATH =
  `${PROJECT_SOURCES_VAULT_DIR}/${PROJECT_SOURCES_VAULT_FILE}`;

/**
 * Private project roots live in the vault sidecar, never in graph markdown.
 * A missing sidecar is an empty initial state; any other read error stays an
 * error so an unreadable binding cannot be overwritten as though it vanished.
 */
export function createVaultFileProjectSourceStore(
  handle: FileSystemDirectoryHandle,
): ProjectSourceStore {
  const sidecar = (create: boolean) =>
    handle.getDirectoryHandle(PROJECT_SOURCES_VAULT_DIR, { create });
  let ignoreEnsured = false;
  const ensureIgnore = async (directory: FileSystemDirectoryHandle) => {
    if (ignoreEnsured) return;
    await ensureSidecarIgnore(directory);
    ignoreEnsured = true;
  };

  return createProjectSourceStore({
    read: async () => {
      try {
        const directory = await sidecar(false);
        const file = await directory.getFileHandle(PROJECT_SOURCES_VAULT_FILE);
        return await (await file.getFile()).text();
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    write: async (text) => {
      const directory = await sidecar(true);
      await ensureIgnore(directory);
      const file = await directory.getFileHandle(PROJECT_SOURCES_VAULT_FILE, {
        create: true,
      });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
  });
}
