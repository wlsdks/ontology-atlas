'use client';

import { useState } from 'react';

import { NewRoundSheet, useLibraryRounds } from '@/views/library';
import { AutomationsPage } from '@/views/automations';

export function AutomationsWorkspace() {
  const runner = useLibraryRounds();
  const [documentsSheetOpen, setDocumentsSheetOpen] = useState(false);

  return (
    <>
      <AutomationsPage runner={runner} onOpenDocumentSchedule={() => setDocumentsSheetOpen(true)} />
      {runner ? (
        <NewRoundSheet
          open={documentsSheetOpen}
          onClose={() => setDocumentsSheetOpen(false)}
          connectors={runner.connectors}
          agentReady={runner.agentReady}
          onSave={runner.save}
          existingCount={runner.rounds.filter((round) => round.kind !== 'ontology').length}
        />
      ) : null}
    </>
  );
}
