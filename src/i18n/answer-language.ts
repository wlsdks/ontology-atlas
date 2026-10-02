import { htmlLangOf, LOCALE_META, type LocaleMeta } from "@/i18n/locales";

type LocaleMetaTable = Readonly<Record<string, LocaleMeta>>;

const AUTHORED_LOCALES: ReadonlySet<string> = new Set(["en", "ko"]);

export function answerLanguageName(locale: string, meta: LocaleMetaTable = LOCALE_META): string {
  const tag = htmlLangOf(locale, meta);
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export function answerLanguageSentence(locale: string, meta: LocaleMetaTable = LOCALE_META): string {
  const name = answerLanguageName(locale, meta);
  return `Answer in ${name} — that is the language this person's interface is set to, and it is the language of the folder they are looking at. If they write to you in another language, follow theirs instead. This matters most when the request arrived from a button rather than something they typed: there is no message of theirs to take the language from, and the instruction you are reading is itself in English.`;
}

export function withAnswerLanguage(text: string, locale: string, meta: LocaleMetaTable = LOCALE_META): string {
  if (AUTHORED_LOCALES.has(locale)) return text;
  return `${text}\n\n${answerLanguageSentence(locale, meta)}`;
}
