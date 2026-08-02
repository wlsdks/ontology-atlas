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

export type ProjectSourceReplaceResult =
  | {
      status: "replaced";
      binding: ProjectSourceBinding;
      bindings: ProjectSourceBinding[];
    }
  | {
      status: "blocked_malformed" | "cancelled" | "measurement_failed";
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
  const read = async (): Promise<ProjectSourceStoreReadResult> => {
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

  return {
    read,
    list: async (projectSlug) => {
      const result = await read();
      if (result.status !== "ok") return result;
      return {
        status: "ok",
        bindings: result.bindings.filter((binding) => binding.projectSlug === projectSlug),
      };
    },
    replaceAfterMeasurement: async (projectSlug, pendingBinding, buildReceipt) => {
      const current = await read();
      if (current.status === "malformed") {
        return { status: "blocked_malformed", bindings: [] };
      }
      let receipt: ProjectSourceReceipt;
      try {
        receipt = await buildReceipt();
      } catch (error) {
        return {
          status:
            error && typeof error === "object" && "name" in error && error.name === "AbortError"
              ? "cancelled"
              : "measurement_failed",
          bindings: current.status === "ok" ? current.bindings : [],
        };
      }
      const binding: ProjectSourceBinding = { ...pendingBinding, receipt };
      const bindings = [
        ...(current.status === "ok"
          ? current.bindings.filter((candidate) => candidate.projectSlug !== projectSlug)
          : []),
        binding,
      ];
      await medium.write(serializeProjectSourceState({ bindings }));
      return { status: "replaced", binding, bindings };
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
