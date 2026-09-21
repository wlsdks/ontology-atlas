import type { AnalysisFinding } from "@/entities/analysis-record";
import { usePanelPresence } from "@/shared/lib/use-presence";
import { LG_BREAKPOINT_PX, useViewportBelow } from "@/shared/lib/use-viewport-below";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type WorkbenchSection = "meaning" | "history" | "conversation";

export function useHomeWorkbenchController() {
  const [vaultAgentOpen, setVaultAgentOpen] = useState(false);
  const [acpChatOpen, setAcpChatOpen] = useState(false);
  const [acpDockFrameOpen, setAcpDockFrameOpen] = useState(false);
  const [meaningWorkbenchOpen, setMeaningWorkbenchOpen] = useState(false);
  const meaningWorkbenchPresence = usePanelPresence(meaningWorkbenchOpen);
  const reviewUsesSheet = useViewportBelow(LG_BREAKPOINT_PX);
  const [showRelationMeaning, setShowRelationMeaning] = useState(true);
  const [analysisParentRunId, setAnalysisParentRunId] = useState<string | null>(null);
  const [analysisParentRequestText, setAnalysisParentRequestText] = useState<string | null>(null);
  const [workbenchSectionRequest, setWorkbenchSectionRequest] = useState<{
    tab: WorkbenchSection;
    nonce: number;
  }>({ tab: "meaning", nonce: 0 });
  const workbenchOpenRef = useRef({ agent: false, meaning: false });
  useLayoutEffect(() => {
    workbenchOpenRef.current = {
      agent: acpDockFrameOpen,
      meaning: meaningWorkbenchOpen,
    };
  }, [acpDockFrameOpen, meaningWorkbenchOpen]);
  const requestWorkbenchSection = useCallback((tab: WorkbenchSection) => {
    setWorkbenchSectionRequest((current) => ({ tab, nonce: current.nonce + 1 }));
  }, []);
  const workbenchSectionRef = useRef<WorkbenchSection>("meaning");
  const openMeaningWorkbench = useCallback(() => {
    setVaultAgentOpen(false);
    setMeaningWorkbenchOpen(true);
    requestWorkbenchSection("meaning");
  }, [requestWorkbenchSection]);
  const toggleMeaningWorkbench = useCallback(() => {
    if (meaningWorkbenchOpen) {
      // The lit meaning chip is also the route home from history/conversation.
      // Only a press while already on meaning closes the workbench.
      if (workbenchSectionRef.current !== "meaning") {
        requestWorkbenchSection("meaning");
        return;
      }
      setMeaningWorkbenchOpen(false);
      return;
    }
    openMeaningWorkbench();
  }, [meaningWorkbenchOpen, openMeaningWorkbench, requestWorkbenchSection]);
  const [analysisFindings, setAnalysisFindings] = useState<readonly AnalysisFinding[]>([]);

  return {
    vaultAgentOpen,
    setVaultAgentOpen,
    acpChatOpen,
    setAcpChatOpen,
    acpDockFrameOpen,
    setAcpDockFrameOpen,
    meaningWorkbenchOpen,
    setMeaningWorkbenchOpen,
    meaningWorkbenchPresence,
    reviewUsesSheet,
    showRelationMeaning,
    setShowRelationMeaning,
    analysisParentRunId,
    setAnalysisParentRunId,
    analysisParentRequestText,
    setAnalysisParentRequestText,
    workbenchSectionRequest,
    workbenchOpenRef,
    requestWorkbenchSection,
    workbenchSectionRef,
    openMeaningWorkbench,
    toggleMeaningWorkbench,
    analysisFindings,
    setAnalysisFindings,
  };
}
