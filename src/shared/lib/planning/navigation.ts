let returning = false;
const listeners = new Set<() => void>();
export function beginPlanningReturn(): void { returning = true; listeners.forEach((listener) => listener()); }
export function clearPlanningReturn(): void { returning = false; listeners.forEach((listener) => listener()); }
export function subscribePlanningReturn(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function getPlanningReturn(): boolean { return returning; }
export function getPlanningReturnServer(): boolean { return false; }
