import {
  CONSTRUCTION_QUALITY_AXES,
  CLAIM_STATUSES,
  CITATION_STATUSES,
  FAILURE_CATEGORIES,
} from './vocabulary.mjs';
import {
  addFinding,
  digest,
  isRecord,
  mapUnique,
  nonBlank,
  portableSourceRef,
  uniqueStrings,
} from './field-rules.mjs';

export function validateWitnesses(packet, findings) {
  const witnesses = mapUnique(packet.witnesses, 'id', findings, 'witnesses');
  for (const [id, row] of witnesses) {
    if (
      !nonBlank(row.kind)
      || typeof row.current !== 'boolean'
      || !isRecord(row.provenance)
      || !portableSourceRef(row.provenance.sourceRef)
      || !digest(row.provenance.digest)
    ) {
      addFinding(
        findings,
        'invalid-witness',
        `witnesses.${id}`,
        'Witnesses need a kind, explicit currentness, and portable digest-bound provenance.',
      );
    }
  }
  return witnesses;
}

export function validateClaims(packet, witnesses, findings) {
  const claims = mapUnique(packet.claims, 'id', findings, 'claims');
  for (const [id, row] of claims) {
    if (
      !CLAIM_STATUSES.has(row.status)
      || !nonBlank(row.statement, 2000)
      || !uniqueStrings(row.witnessRefs)
      || !uniqueStrings(row.proposalRefs)
      || row.proposalRefs.length === 0
    ) {
      addFinding(findings, 'invalid-claim', `claims.${id}`, 'Claim status, witness refs, and proposal refs are invalid.');
      continue;
    }
    for (const ref of row.witnessRefs) {
      if (!witnesses.has(ref)) {
        addFinding(findings, 'unknown-witness-ref', `claims.${id}.witnessRefs`, `Unknown witness: ${ref}`);
      }
    }
    if (row.status === 'supported' && row.witnessRefs.length === 0) {
      addFinding(
        findings,
        'unsupported-supported-claim',
        `claims.${id}`,
        'A supported claim needs at least one witness.',
      );
    }
    if (
      row.status === 'supported'
      && row.witnessRefs.some((ref) => witnesses.get(ref)?.current !== true)
    ) {
      addFinding(
        findings,
        'stale-supported-claim',
        `claims.${id}`,
        'A supported claim cannot depend on a stale witness.',
        { severity: 'failure', category: 'evidence', refs: row.witnessRefs },
      );
    }
  }
  return claims;
}

export function validateCitationChecks(packet, claims, witnesses, findings) {
  if (!Array.isArray(packet.citationChecks)) {
    addFinding(findings, 'invalid-array', 'citationChecks', 'citationChecks must be an array.');
    return [];
  }
  packet.citationChecks.forEach((row, index) => {
    const path = `citationChecks[${index}]`;
    const claim = claims.get(row?.claimId);
    if (!claim || !CITATION_STATUSES.has(row?.status)) {
      addFinding(findings, 'invalid-citation-check', path, 'Citation check must name a claim and status.');
      return;
    }
    if (row.status === 'missing') {
      if (row.witnessRef !== null) {
        addFinding(findings, 'invalid-missing-citation', `${path}.witnessRef`, 'Missing citation uses null.');
      }
    } else if (!witnesses.has(row.witnessRef)) {
      addFinding(findings, 'unknown-witness-ref', `${path}.witnessRef`, 'Citation witness is unknown.');
    } else if (!claim.witnessRefs.includes(row.witnessRef)) {
      addFinding(
        findings,
        'citation-outside-claim',
        `${path}.witnessRef`,
        'A citation check must verify a witness carried by the exact claim.',
      );
    } else if (row.status === 'verified' && witnesses.get(row.witnessRef)?.current !== true) {
      addFinding(
        findings,
        'stale-verified-citation',
        `${path}.witnessRef`,
        'A verified citation must point to a current witness.',
        { severity: 'failure', category: 'evidence', refs: [row.witnessRef] },
      );
    }
  });
  for (const id of claims.keys()) {
    if (!packet.citationChecks.some(({ claimId }) => claimId === id)) {
      addFinding(
        findings,
        'missing-claim-citation-check',
        'citationChecks',
        `Claim ${id} has no citation check.`,
        { severity: 'failure', category: 'evidence' },
      );
    }
  }
  return packet.citationChecks;
}

export function validateDiagnostics(packet, witnesses, findings) {
  const diagnostics = mapUnique(packet.diagnostics, 'id', findings, 'diagnostics');
  for (const [id, row] of diagnostics) {
    if (
      !CONSTRUCTION_QUALITY_AXES.includes(row.axis)
      || !FAILURE_CATEGORIES.has(row.category)
      || !nonBlank(row.message)
      || !uniqueStrings(row.evidenceRefs)
    ) {
      addFinding(
        findings,
        'invalid-diagnostic',
        `diagnostics.${id}`,
        'Diagnostic needs an axis, supported category, message, and evidence refs.',
      );
      continue;
    }
    for (const ref of row.evidenceRefs) {
      if (!witnesses.has(ref)) {
        addFinding(findings, 'unknown-witness-ref', `diagnostics.${id}.evidenceRefs`, `Unknown witness: ${ref}`);
      }
    }
  }
  return diagnostics;
}
