export type BuilderSourceStatus = "writable" | "restoring" | "unavailable" | "readonly";

export type BuilderSourceAccent = "indigo" | "amber" | "neutral";

export interface BuilderSourceStatusInput {
  writable: boolean;
  restoringVault: boolean;
  vaultUnavailable: boolean;
}

export interface BuilderSourceStatusView {
  status: BuilderSourceStatus;
  accent: BuilderSourceAccent;
  showSourceAction: boolean;
}

export function getBuilderSourceStatus({
  writable,
  restoringVault,
  vaultUnavailable,
}: BuilderSourceStatusInput): BuilderSourceStatusView {
  if (writable) {
    return {
      status: "writable",
      accent: "indigo",
      showSourceAction: false,
    };
  }
  if (restoringVault) {
    return {
      status: "restoring",
      accent: "neutral",
      showSourceAction: false,
    };
  }
  if (vaultUnavailable) {
    return {
      status: "unavailable",
      accent: "amber",
      showSourceAction: true,
    };
  }
  return {
    status: "readonly",
    accent: "amber",
    showSourceAction: true,
  };
}
