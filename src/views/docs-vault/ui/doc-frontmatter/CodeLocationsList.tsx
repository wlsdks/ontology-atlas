import { useTranslations } from "use-intl";
import { CodeLocationRow } from "./CodeLocationRow";

/** The code paths `elements:` names as evidence, each with a copy button. */
export function CodeLocationsList({ codeLocations }: { codeLocations: string[] }) {
  const t = useTranslations("docsVault.frontmatterBlock");
  return (
    <div
      data-testid="doc-frontmatter-code-locations"
      className="mt-2 flex flex-col gap-1 border-t border-[color:var(--color-divider)] pt-2 font-sans"
    >
      <div className="flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
        <span>{t("codeLocationsHeading")}</span>
        <span className="font-mono">{codeLocations.length}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {codeLocations.map((path) => (
          <CodeLocationRow
            key={path}
            path={path}
            copyLabel={t("codeLocationsCopy")}
            copiedLabel={t("codeLocationsCopied")}
            copyAriaLabel={t("codeLocationsCopyAriaLabel", { path })}
          />
        ))}
      </ul>
      <p
        data-testid="doc-frontmatter-code-locations-help"
        className="text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t("codeLocationsConsumerHelp")}
      </p>
    </div>
  );
}
