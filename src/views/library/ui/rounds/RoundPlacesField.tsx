import { Cable, Check, Folder, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "use-intl";
import { useId, type ChangeEvent } from "react";

import { controlClass, fieldLabel } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { Chip, IconButton, Surface } from "@/shared/ui";
import { Input } from "@/shared/ui/fields/input";

import { capitalize, serviceExample } from "../../lib/rounds/round-presentation";
import type { ServiceDraft } from "../../model/rounds/round-draft";

/**
 * What the round looks at: the folder row with its folder menu, one row per service place, and the
 * menu that adds a place. The two menus' open state lives in the sheet, whose outside press and
 * Escape close them from anywhere in the form.
 */
export function RoundPlacesField({
  folders, vaultPaths, ownDocumentsOnly, folderNames, services, enabledConnectors, showNoAgent,
  addOpen, folderMenuOpen, onAddOpenChange, onFolderMenuOpenChange,
  onToggleFolder, onToggleOwnDocumentsOnly, onAddService, onPatchService, onRemoveService,
}: {
  folders: readonly string[];
  vaultPaths: readonly string[];
  ownDocumentsOnly: boolean;
  folderNames: readonly string[];
  services: readonly ServiceDraft[];
  enabledConnectors: readonly { id: string; name: string }[];
  /** A service place is named but no agent is connected to run it. */
  showNoAgent: boolean;
  addOpen: boolean;
  folderMenuOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  onFolderMenuOpenChange: (open: boolean) => void;
  onToggleFolder: (folder: string) => void;
  onToggleOwnDocumentsOnly: () => void;
  onAddService: (connector: { id: string; name: string }) => void;
  onPatchService: (key: string, change: Partial<ServiceDraft>) => void;
  onRemoveService: (key: string) => void;
}) {
  const t = useTranslations("library.rounds");
  const placesId = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={placesId} className={fieldLabel()}>
        {t("sheet.places")}
      </p>
      <ul aria-labelledby={placesId} data-testid="library-rounds-places" className="flex flex-col">
        <li
          data-testid="library-rounds-place-vault"
          className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] py-2.5"
        >
          <div className="flex min-w-0 items-start gap-2">
            <Folder size={ICON_SIZE.sm} aria-hidden className="mt-0.5 flex-none text-[color:var(--color-text-quaternary)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-body leading-body text-[color:var(--color-text-primary)]">{t("sheet.placeVault")}</span>
              <span className="mt-0.5 block text-body leading-body text-[color:var(--color-text-tertiary)]">
                {folderNames.length > 0 ? folderNames.join(" · ") : t("sheet.placeVaultAll")}
              </span>
            </span>
            {/* The first row is the folder itself and has no remove press: a round with no
                place at all would be a rule about nothing. */}
            <span className="relative flex-none">
              <Chip
                size="md"
                tone="muted"
                onClick={() => {
                  onAddOpenChange(false);
                  onFolderMenuOpenChange(!folderMenuOpen);
                }}
                aria-expanded={folderMenuOpen}
                data-testid="library-rounds-folders"
              >
                {t("sheet.chooseFolders")}
              </Chip>
              <Surface
                open={folderMenuOpen}
                motion="chrome"
                role="group"
                aria-label={t("sheet.chooseFolders")}
                className="absolute right-0 top-[calc(100%+4px)] z-10 max-h-56 w-64 max-w-[calc(100vw-4rem)] overflow-y-auto atlas-scroll-quiet rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-1.5 shadow-[var(--shadow-elevation-2)]"
                {...transientSurface("menu")}
                data-testid="library-rounds-folder-menu"
              >
                <button
                  type="button"
                  onClick={() => onToggleOwnDocumentsOnly()}
                  className={controlClass({ shape: "row", size: "md", active: ownDocumentsOnly, hoverSurface: "lift", className: "w-full justify-start text-left" })}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body leading-body">{t("sheet.placeOwn")}</span>
                    <span className="block truncate text-body leading-body text-[color:var(--color-text-tertiary)]">{t("sheet.placeOwnDetail")}</span>
                  </span>
                  {ownDocumentsOnly ? <Check size={ICON_SIZE.sm} aria-hidden className="flex-none" /> : null}
                </button>
                {folders.length === 0 ? (
                  <p className="px-2 py-1.5 text-body leading-body text-[color:var(--color-text-tertiary)]">{t("sheet.noFolders")}</p>
                ) : (
                  folders.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => onToggleFolder(folder)}
                      data-folder={folder}
                      className={controlClass({ shape: "row", size: "md", active: vaultPaths.includes(folder), hoverSurface: "lift", className: "w-full justify-start text-left" })}
                    >
                      <span className="min-w-0 flex-1 truncate text-body leading-body">{folder}</span>
                      {vaultPaths.includes(folder) ? <Check size={ICON_SIZE.sm} aria-hidden className="flex-none" /> : null}
                    </button>
                  ))
                )}
              </Surface>
            </span>
          </div>
          {vaultPaths.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {vaultPaths.map((folder) => (
                <Chip key={folder} size="md" tone="muted" onClick={() => onToggleFolder(folder)} aria-label={t("sheet.removeFolder", { folder })}>
                  <span className="truncate">{folder}</span>
                  <Trash2 size={ICON_SIZE.sm} aria-hidden />
                </Chip>
              ))}
            </div>
          ) : null}
        </li>

        {services.map((draft, index) => (
          <li
            key={draft.key}
            data-testid={`library-rounds-place-${index}`}
            data-connector={draft.connectorName}
            className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] py-2.5"
          >
            <div className="flex min-w-0 items-start gap-2">
              {/* The kind glyph, matching the folder row above it — never a rotated plus,
                  which reads as a close button sitting at the head of the row. */}
              <Cable size={ICON_SIZE.sm} aria-hidden className="mt-0.5 flex-none text-[color:var(--color-text-quaternary)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-body leading-body text-[color:var(--color-text-primary)]">{capitalize(draft.connectorName)}</span>
                <span className="mt-0.5 block text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {draft.location.trim() || t("sheet.whereAnywhere")}
                </span>
              </span>
              <IconButton
                size="md"
                label={t("sheet.removePlace", { place: capitalize(draft.connectorName) })}
                onClick={() => onRemoveService(draft.key)}
                data-testid={`library-rounds-place-${index}-remove`}
                className="flex-none"
              >
                <Trash2 size={ICON_SIZE.sm} aria-hidden />
              </IconButton>
            </div>
            <div className="grid grid-cols-1 gap-3 pl-6 sm:grid-cols-2">
              <Input
                label={t("sheet.where")}
                value={draft.location}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onPatchService(draft.key, { location: event.target.value })}
                placeholder={t("sheet.wherePlaceholder")}
                data-testid={`library-rounds-place-${index}-where`}
              />
              <Input
                label={t("sheet.query")}
                value={draft.query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onPatchService(draft.key, { query: event.target.value })}
                placeholder={t(`sheet.queryPlaceholder${serviceExample(draft.connectorName)}`)}
                data-testid={`library-rounds-place-${index}-query`}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="relative self-start border-t border-transparent">
        <Chip
          size="md"
          tone="muted"
          onClick={() => {
            onFolderMenuOpenChange(false);
            onAddOpenChange(!addOpen);
          }}
          aria-expanded={addOpen}
          data-testid="library-rounds-add-place"
        >
          <Plus size={ICON_SIZE.sm} aria-hidden />
          {t("sheet.addPlace")}
        </Chip>
        <Surface
          open={addOpen}
          motion="chrome"
          role="menu"
          aria-label={t("sheet.addPlace")}
          className="absolute left-0 top-[calc(100%+4px)] z-10 w-72 max-w-[calc(100vw-4rem)] rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-1.5 shadow-[var(--shadow-elevation-2)]"
          {...transientSurface("menu")}
          data-testid="library-rounds-add-menu"
        >
          {enabledConnectors.length === 0 ? (
            <p className="px-2 py-1.5 text-body leading-body text-[color:var(--color-text-tertiary)]">{t("sheet.addNoConnector")}</p>
          ) : (
            enabledConnectors.map((connector) => (
              <button
                key={connector.id}
                type="button"
                role="menuitem"
                onClick={() => onAddService(connector)}
                data-connector={connector.name}
                className={controlClass({ shape: "row", size: "md", hoverSurface: "lift", className: "w-full justify-start text-left" })}
              >
                <span className="min-w-0 flex-1 truncate text-body leading-body">{capitalize(connector.name)}</span>
              </button>
            ))
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAddOpenChange(false);
              onFolderMenuOpenChange(true);
            }}
            className={controlClass({ shape: "row", size: "md", hoverSurface: "lift", className: "w-full justify-start text-left" })}
          >
            <span className="min-w-0 flex-1 truncate text-body leading-body">{t("sheet.addFolder")}</span>
          </button>
        </Surface>
      </div>
      {showNoAgent ? (
        <p className="text-body leading-body text-[color:var(--color-amber-source-a90)]">{t("sheet.noAgent")}</p>
      ) : null}
    </div>
  );
}
