import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { humanMeaningRepair, validAgentBrief } from './agent-brief-fixtures.mjs';
import { agentBriefExitCode, assertAgentBriefShape } from './agent-brief.mjs';

describe('agent-brief', () => {
  it('validates agent_brief handoff payloads and exit status', () => {
    const valid = validAgentBrief();

    assert.equal(assertAgentBriefShape(valid), valid);
    assert.equal(agentBriefExitCode(valid), 0);
    const executableRepair = humanMeaningRepair(valid.projectSlug);
    assert.equal(assertAgentBriefShape({ ...valid, meaningRepair: executableRepair }).meaningRepair, executableRepair);
    const oldPseudoRead = structuredClone(executableRepair);
    oldPseudoRead.workflow[0] = {
      step: 'read_review_inputs',
      calls: [{
        tool: 'get_concepts',
        arguments: { body: 'full' },
        deriveArguments: { slugs: 'project_and_all_review_targets' },
      }],
    };
    const mismatchedRevision = structuredClone(executableRepair);
    mismatchedRevision.workflow[0].calls[0].arguments.reviewRevision = `sha256:${'b'.repeat(64)}`;
    const exposedOffset = structuredClone(executableRepair);
    exposedOffset.workflow[0].calls[0].arguments.offset = 20;
    const wrongOperation = structuredClone(executableRepair);
    wrongOperation.workflow[0].calls[0].arguments.operation = 'agent_brief';
    const oversizedPacket = structuredClone(executableRepair);
    oversizedPacket.provenance.sourceFingerprint = `git:${'x'.repeat(5_000)}`;
    for (const malformed of [
      oldPseudoRead,
      mismatchedRevision,
      exposedOffset,
      wrongOperation,
      oversizedPacket,
    ]) {
      assert.throws(
        () => assertAgentBriefShape({ ...valid, meaningRepair: malformed }),
        /agent_brief meaningRepair must contain the action-first human review packet/,
      );
    }
    assert.equal(agentBriefExitCode({ ...valid, readiness: { ...valid.readiness, status: 'needs_attention' } }), 1);
    assert.throws(
      () => assertAgentBriefShape({ ...valid, projectSource: { ...valid.projectSource, status: 'ready' } }),
      /agent_brief projectSource must contain the versioned categorical source receipt view/,
    );
    assert.throws(
      () => {
        const withoutAssessment = { ...valid };
        delete withoutAssessment.meaningAssessment;
        return assertAgentBriefShape(withoutAssessment);
      },
      /agent_brief meaningAssessment must contain the categorical fail-closed project meaning view/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        meaningAssessment: { ...valid.meaningAssessment, confidence: 0.99 },
      }),
      /agent_brief meaningAssessment must contain the categorical fail-closed project meaning view/,
    );
    assert.throws(
      () => {
        const withoutRepair = { ...valid };
        delete withoutRepair.meaningRepair;
        return assertAgentBriefShape(withoutRepair);
      },
      /agent_brief meaningRepair must contain the action-first human review packet/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        meaningRepair: {
          ...valid.meaningRepair,
          provenance: { rootPath: '/private/work/app' },
        },
      }),
      /agent_brief meaningRepair must contain the action-first human review packet/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        projectSource: {
          ...valid.projectSource,
          receipt: { ...valid.projectSource.receipt, rootPath: '/private/work/app' },
        },
      }),
      /agent_brief projectSource must contain the versioned categorical source receipt view/,
    );
    assert.throws(
      () => {
        const withoutLens = { ...valid };
        delete withoutLens.businessOntologyLens;
        return assertAgentBriefShape(withoutLens);
      },
      /agent_brief businessOntologyLens must describe the business-first outcome-domain-capability-evidence read order/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        businessOntologyLens: {
          ...valid.businessOntologyLens,
          decisionQuestions: [],
        },
      }),
      /agent_brief businessOntologyLens must describe the business-first outcome-domain-capability-evidence read order/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, handoffPrompt: 'missing useful handoff content' }),
      /agent_brief handoffPrompt must be a non-empty agent handoff string/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        docs: {
          ...valid.docs,
          graphScanProofChecklist: valid.docs.graphScanProofChecklist.filter(
            (row) => row.id !== 'prove_edge_rows',
          ),
        },
      }),
      /agent_brief docs must include workflowGuide and graphScanProofChecklist guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        docs: {
          ...valid.docs,
          modeComparison: valid.docs.modeComparison.filter(
            (row) => row.id !== 'setup_gate',
          ),
        },
      }),
      /agent_brief docs must include workflowGuide and graphScanProofChecklist guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, cliFallbackCommands: [] }),
      /agent_brief cliFallbackCommands must include non-empty runnable CLI fallback commands/,
    );
    /*
     * The runnable form is accepted and a bare `ontology-atlas` is rejected: no global command by that name exists.
     */
    assert.throws(
      () => assertAgentBriefShape({ ...valid, cliFallbackCommands: ['ontology-atlas health'] }),
      /agent_brief cliFallbackCommands must include non-empty runnable CLI fallback commands/,
    );
    assert.equal(
      assertAgentBriefShape({
        ...valid,
        cliFallbackCommands: ["node '/tmp/ontology atlas/cli/src/index.mjs' health [vault]"],
      }).operation,
      'agent_brief',
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, firstCalls: [{ tool: 'query_ontology', arguments: {} }] }),
      /firstCalls\[0\] has an invalid tool-call shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        firstCalls: valid.firstCalls.filter((call) => call.arguments.operation !== 'relation_check'),
      }),
      /agent_brief firstCalls must include relation_check preflight/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, graphDbQueryPack: valid.graphDbQueryPack.slice(1) }),
      /agent_brief graphDbQueryPack must include graph facets, node scan, edge scan, domain coupling, and path evidence query packs/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: [
          { ...valid.playbooks[0], calls: valid.playbooks[0].calls.filter((call) => call.arguments.operation !== 'relation_check') },
          valid.playbooks[1],
        ],
      }),
      /agent_brief refactor_impact playbook must include relation_check preflight/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: [{ ...valid.playbooks[0], evidence: [] }, valid.playbooks[1]],
      }),
      /agent_brief playbooks\[0\] has an invalid playbook shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: [{ ...valid.playbooks[0], stopWhen: [] }, valid.playbooks[1]],
      }),
      /agent_brief playbooks\[0\] has an invalid playbook shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.filter((playbook) => playbook.id !== 'onboarding_map'),
      }),
      /agent_brief playbooks must include onboarding_map/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'onboarding_map'
            ? { ...playbook, calls: playbook.calls.filter((call) => call.arguments.operation !== 'match_nodes') }
            : playbook,
        ),
      }),
      /agent_brief onboarding_map playbook must include match_nodes/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'onboarding_map'
            ? {
                ...playbook,
                calls: playbook.calls.map((call) =>
                  call.arguments.operation === 'query_plan'
                    ? { ...call, arguments: { ...call.arguments, targetOperation: 'centrality' } }
                    : call,
                ),
              }
            : playbook,
        ),
      }),
      /agent_brief onboarding_map playbook must include query_plan\(match_nodes\)/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.filter((playbook) => playbook.id !== 'coupling_audit'),
      }),
      /agent_brief playbooks must include coupling_audit/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'coupling_audit'
            ? { ...playbook, calls: playbook.calls.filter((call) => call.arguments.operation !== 'match_edges') }
            : playbook,
        ),
      }),
      /agent_brief coupling_audit playbook must include match_edges/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'coupling_audit'
            ? {
                ...playbook,
                calls: playbook.calls.filter(
                  (call) =>
                    call.arguments.operation !== 'query_plan'
                    || call.arguments.targetOperation !== 'match_edges',
                ),
              }
            : playbook,
        ),
      }),
      /agent_brief coupling_audit playbook must include query_plan\(match_edges\)/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.filter((playbook) => playbook.id !== 'graph_traversal'),
      }),
      /agent_brief playbooks must include graph_traversal/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'graph_traversal'
            ? { ...playbook, calls: playbook.calls.filter((call) => call.arguments.operation !== 'all_paths') }
            : playbook,
        ),
      }),
      /agent_brief graph_traversal playbook must include all_paths/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, traversalStrategy: [] }),
      /agent_brief traversalStrategy must include plan, bounded path evidence, and containment cross-check guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        traversalStrategy: valid.traversalStrategy.filter((strategy) => strategy.id !== 'bounded_path_evidence'),
      }),
      /agent_brief traversalStrategy must include plan, bounded path evidence, and containment cross-check guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, writePolicy: ['Run read tools first.'] }),
      /agent_brief writePolicy must mention relation_check before add_relation/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, resultContracts: [] }),
      /agent_brief resultContracts must include all_paths completeness plus match_nodes\/match_edges followUp policies/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        resultContracts: [{ ...valid.resultContracts[0], mustReport: ['searchBudget'] }],
      }),
      /agent_brief resultContracts must include all_paths completeness plus match_nodes\/match_edges followUp policies/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        resultContracts: valid.resultContracts.filter((contract) => contract.operation !== 'match_edges'),
      }),
      /agent_brief resultContracts must include all_paths completeness plus match_nodes\/match_edges followUp policies/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        relationDecisionGuide: valid.relationDecisionGuide.filter((row) => row.decision !== 'review_inverse'),
      }),
      /agent_brief relationDecisionGuide must cover relation_check decision outcomes/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, writeGuardrails: [] }),
      /agent_brief writeGuardrails must be a non-empty array/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        writeGuardrails: valid.writeGuardrails.filter((guardrail) => guardrail.id !== 'preflight_rename'),
      }),
      /agent_brief writeGuardrails must include preflight_rename find_backlinks/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        writeGuardrails: valid.writeGuardrails.map((guardrail) =>
          guardrail.id === 'post_change_sync'
            ? {
                ...guardrail,
                calls: guardrail.calls.filter((call) => call.arguments?.operation !== 'maintenance_plan'),
              }
            : guardrail,
        ),
      }),
      /agent_brief writeGuardrails must include post_change_sync maintenance_plan/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        writeGuardrails: [{ id: 'post_change_sync', goal: 'After changes.', calls: [{ tool: 'validate_vault', arguments: { extra: true } }] }],
      }),
      /agent_brief writeGuardrails\[0\] has an invalid guardrail shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, sideEffect: true }),
      /agent_brief sideEffect must be false/,
    );
  });
});
