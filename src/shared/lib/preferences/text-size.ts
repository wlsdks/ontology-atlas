import { definePreference } from "./define-preference";

export const TEXT_SIZES = ["default", "large", "larger"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_ROOT_PERCENT: Readonly<Record<TextSize, number>> = {
  default: 100,
  large: 112.5,
  larger: 125,
};

export const TEXT_SIZE_ATTRIBUTE = "data-text-size";

const textSizePreference = definePreference<TextSize>({
  key: "atlas.appearance.text-size",
  values: TEXT_SIZES,
  fallback: "default",
});

export function writeTextSize(value: TextSize): void {
  textSizePreference.write(value);
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (value === "default") root.removeAttribute(TEXT_SIZE_ATTRIBUTE);
  else root.setAttribute(TEXT_SIZE_ATTRIBUTE, value);
}

export function useTextSize(): TextSize {
  return textSizePreference.use();
}
