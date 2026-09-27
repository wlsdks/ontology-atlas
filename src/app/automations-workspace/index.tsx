'use client';

import { useState } from 'react';

import { NewRoundSheet, useLibraryRounds, useVaultFolders } from '@/views/library';
import { AutomationsPage } from '@/views/automations';

export function AutomationsWorkspace() {
  const runner = useLibraryRounds();
  const [documentsSheetOpen, setDocumentsSheetOpen] = useState(false);
  const [documentsDraft, setDocumentsDraft] = useState(0);
  const openDocumentsSheet = () => {
    setDocumentsDraft((draft) => draft + 1);
    setDocumentsSheetOpen(true);
  };
  // Read the folder list from disk only while the sheet is up, as the Library screen does.
  const folders = useVaultFolders(documentsSheetOpen);
  const documentRounds = (runner?.rounds ?? []).filter((round) => round.kind !== 'ontology');

  return (
    <>
      <AutomationsPage runner={runner} onOpenDocumentSchedule={openDocumentsSheet} />
      {runner ? (
        <NewRoundSheet
          key={documentsDraft}
          open={documentsSheetOpen}
          onClose={() => setDocumentsSheetOpen(false)}
          connectors={runner.connectors}
          agentReady={runner.agentReady}
          folders={folders}
          /* This lane only needs `save`'s `ok`; the Library screen also reports `startedNow`. */
          onSave={async (round) => (await runner.save(round)).ok}
          existingNames={documentRounds.map((round) => round.name)}
          passRunning={runner.running !== null}
        />
      ) : null}
    </>
  );
}
