import {
  type RoundCadence,
  type RoundOnStale,
  type RoundPlace,
  type RoundPlaceService,
  type RoundRecord,
  cadenceMinutes,
  nextDueAt,
  roundPlaces,
  servicePlaces,
  vaultPlace,
} from "@/entities/library-round";
import type { CadenceUnit } from "@/shared/ui/cadence-picker";

/** A service place while it is being edited: the key keeps React rows stable as fields change. */
export interface ServiceDraft {
  key: string;
  connectorId: string;
  connectorName: string;
  location: string;
  query: string;
}

export function newRoundId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** What the sheet opens with: the round being edited, or the defaults of a new one (every hour). */
export function initialRoundDraft(round: RoundRecord | null) {
  const placesNow = round ? roundPlaces(round) : [];
  const everyMinutes = round ? cadenceMinutes(round.cadence) : 60;
  return {
    vault: vaultPlace(placesNow),
    services: servicePlaces(placesNow).map<ServiceDraft>((place) => ({
      key: newRoundId(),
      connectorId: place.connectorId,
      connectorName: place.connectorName,
      location: place.location ?? "",
      query: place.query ?? "",
    })),
    unit: (everyMinutes === null ? "day" : everyMinutes < 60 ? "minutes" : "hours") as CadenceUnit,
    minutes: everyMinutes ?? 60,
    daily: round && "daily" in round.cadence ? round.cadence : null,
  };
}

/** The places a draft names: the folder first, then each service with only the fields filled in. */
export function placesOfDraft(vaultPaths: readonly string[], ownDocumentsOnly: boolean, services: readonly ServiceDraft[]): RoundPlace[] {
  const vault: RoundPlace = { kind: "vault", paths: [...vaultPaths] };
  if (ownDocumentsOnly) (vault as { ownDocumentsOnly?: boolean }).ownDocumentsOnly = true;
  return [
    vault,
    ...services.map<RoundPlaceService>((draft) => {
      const place: RoundPlaceService = { kind: "service", connectorId: draft.connectorId, connectorName: draft.connectorName };
      if (draft.location.trim()) place.location = draft.location.trim();
      if (draft.query.trim()) place.query = draft.query.trim();
      return place;
    }),
  ];
}

/** The record the sheet saves; an edit keeps the round's id, creation time, enabled state and last pass. */
export function roundRecordOf({ round, name, kind, cadence, places, onStale, services, limit, now }: {
  round: RoundRecord | null;
  name: string;
  kind: RoundRecord["kind"];
  cadence: RoundCadence;
  places: RoundPlace[];
  onStale: RoundOnStale;
  services: readonly ServiceDraft[];
  limit: number | undefined;
  now: Date;
}): RoundRecord {
  const record: RoundRecord = {
    id: round?.id ?? newRoundId(),
    name: name.trim(),
    kind,
    cadence,
    enabled: round?.enabled ?? true,
    places,
    createdAt: round?.createdAt ?? now.toISOString(),
    nextDueAt: nextDueAt(cadence, now).toISOString(),
  };
  record.onStale = onStale;
  if (round?.lastPassAt) record.lastPassAt = round.lastPassAt;
  const first = services[0];
  if (first) {
    record.connectorId = first.connectorId;
    record.connectorName = first.connectorName;
    record.query = first.query.trim();
    record.limit = limit;
  }
  return record;
}
