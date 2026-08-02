export interface CopyHandoffWithFeedbackInput {
  text: string;
  copy: (text: string) => Promise<boolean>;
  show: (message: string, tone: "success" | "error") => void;
  copiedMessage: string;
  failedMessage: string;
}

export async function copyHandoffWithFeedback({
  text,
  copy,
  show,
  copiedMessage,
  failedMessage,
}: CopyHandoffWithFeedbackInput): Promise<void> {
  const copied = await copy(text);
  show(copied ? copiedMessage : failedMessage, copied ? "success" : "error");
}
