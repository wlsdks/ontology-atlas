'use client';

import { useState } from 'react';

import { NewRoundSheet, useLibraryRounds, useVaultFolders } from '@/views/library';
import { AutomationsPage } from '@/views/automations';

export function AutomationsWorkspace() {
  const runner = useLibraryRounds();
  const [documentsSheetOpen, setDocumentsSheetOpen] = useState(false);
  // Read the folder list from disk only while the sheet is up, as the Library screen does.
  const folders = useVaultFolders(documentsSheetOpen);
  const documentRounds = (runner?.rounds ?? []).filter((round) => round.kind !== 'ontology');

  return (
    <>
      <AutomationsPage runner={runner} onOpenDocumentSchedule={() => setDocumentsSheetOpen(true)} />
      {runner ? (
        <NewRoundSheet
          open={documentsSheetOpen}
          onClose={() => setDocumentsSheetOpen(false)}
          connectors={runner.connectors}
          agentReady={runner.agentReady}
          folders={folders}
          /*
           * `save` answers `{ ok, startedNow }` so the Library screen can say which of the two
           * promises it kept. This lane has no line to say it in, so it takes the verdict only;
           * the sheet closes on `ok` exactly as before.
           */
          onSave={async (round) => (await runner.save(round)).ok}
          existingNames={documentRounds.map((round) => round.name)}
          passRunning={runner.running !== null}
        />
      ) : null}
    </>
  );
}
