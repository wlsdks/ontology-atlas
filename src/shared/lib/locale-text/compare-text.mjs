const ENGLISH_COLLATOR = new Intl.Collator('en');

/**
 * Orders two strings the same way on every machine. Without a locale,
 * `localeCompare` follows the process's language: a Korean terminal puts Hangul
 * before Latin and an English one after, so a list or a stored hash built from
 * the sorted values changed with the language the program was launched in.
 */
export function compareText(left, right) {
  return ENGLISH_COLLATOR.compare(left, right);
}
