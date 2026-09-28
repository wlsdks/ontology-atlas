'use client';

import { useState } from 'react';

import type { RoundRecord } from '@/entities/library-round';
import { NewRoundSheet, useLibraryRounds, useVaultFolders } from '@/views/library';
import { AutomationsPage } from '@/views/automations';

export function AutomationsWorkspace() {
  const runner = useLibraryRounds();
  const [documentsSheetOpen, setDocumentsSheetOpen] = useState(false);
  const [documentsDraft, setDocumentsDraft] = useState(0);
  const [editing, setEditing] = useState<RoundRecord | null>(null);
  const openDocumentsSheet = (round: RoundRecord | null) => {
    setEditing(round);
    setDocumentsDraft((draft) => draft + 1);
    setDocumentsSheetOpen(true);
  };
  // Read the folder list from disk only while the sheet is up, as the Library screen does.
  const folders = useVaultFolders(documentsSheetOpen);
  const documentRounds = (runner?.rounds ?? []).filter((round) => round.kind !== 'ontology');

  return (
    <>
      <AutomationsPage runner={runner} onOpenDocumentSchedule={() => openDocumentsSheet(null)} onEditDocumentSchedule={openDocumentsSheet} />
      {runner ? (
        <NewRoundSheet
          key={documentsDraft}
          open={documentsSheetOpen}
          onClose={() => setDocumentsSheetOpen(false)}
          connectors={runner.connectors}
          agentReady={runner.agentReady}
          folders={folders}
          onSave={async (round) => (editing ? runner.update(round) : (await runner.save(round)).ok)}
          existingNames={documentRounds.filter((round) => round.id !== editing?.id).map((round) => round.name)}
          passRunning={runner.running !== null}
          round={editing}
          allowedHere={editing ? !runner.notAllowedHere.has(editing.id) : true}
        />
      ) : null}
    </>
  );
}
