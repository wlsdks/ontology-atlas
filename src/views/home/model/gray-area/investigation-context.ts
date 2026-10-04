import type { AnalysisCaptureContext } from '@/features/acp-session';
import { buildGrayAreaCandidates, buildGrayAreaInvestigation, parseInvestigationPacket } from '@/features/gray-area';
import type { VaultDoc } from '@/entities/docs-vault';
import type { useAcpRuntimeController } from '../use-acp-runtime-controller';

export function investigationCaptureContext(
  base:AnalysisCaptureContext,
  basis:ReturnType<typeof useAcpRuntimeController>['investigationBasis']|undefined,
  vaultPath:string|null,
  docs:readonly VaultDoc[],
):AnalysisCaptureContext|null {
  if(!basis||basis.vaultPath!==vaultPath)return null;
  const packet=parseInvestigationPacket(basis.text);
  const project=docs.find(doc=>doc.slug===packet?.basis.projectSlug&&doc.frontmatter.kind==='project');
  if(!packet||project?.frontmatter.uid!==packet.projectUid||basis.projectUid!==packet.projectUid)return null;
  const candidate=buildGrayAreaCandidates(basis.snapshot).find(row=>row.id===packet.candidate.id);
  if(!candidate||buildGrayAreaInvestigation(basis.snapshot,candidate,{projectUid:basis.projectUid,explicit:true})!==basis.text)return null;
  return {...base,scope:{projectSlug:packet.basis.projectSlug,projectUid:packet.projectUid,targetSlugs:packet.nodes.map(node=>node.slug),profileSlug:null},sourceFingerprint:packet.basis.sourceFingerprint};
}
