import { ABSORB_FIXTURE_PATH } from '../absorb-fixture.mjs';
import { REPO_ROOT } from '../paths.mjs';

export const VERIFY_TUNED_HEALTH_ARGS = {
  componentLimit: 3,
  cycleLimit: 3,
  recommendationLimit: 3,
  orderLimit: 3,
  dependencyTypes: ['dependencies'],
  componentTypes: ['domains', 'domain', 'capabilities', 'dependencies'],
};
export const VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT = 3;

export function buildFirstContactRequests() {
  return [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'verify-cli', version: '0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    {
      jsonrpc: '2.0',
      id: 73,
      method: 'tools/call',
      params: { name: 'connection_info', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 71,
      method: 'tools/call',
      params: { name: 'git_status', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 72,
      method: 'tools/call',
      params: { name: 'git_history', arguments: { limit: 20 } },
    },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { limit: 5 } },
    },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { limit: 1 } },
    },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'validate_vault', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 18,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { kind: 'project', limit: 1 } },
    },
    {
      jsonrpc: '2.0',
      id: 19,
      method: 'tools/call',
      params: { name: 'find_orphans', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: { name: 'find_evidence', arguments: { title: 'project' } },
    },
    {
      jsonrpc: '2.0',
      id: 34,
      method: 'tools/call',
      params: { name: 'query_concepts', arguments: { filter: 'kind=project', limit: 5 } },
    },
    {
      jsonrpc: '2.0',
      id: 38,
      method: 'tools/call',
      params: { name: 'analyze_repo_structure', arguments: { rootPath: REPO_ROOT, maxDepth: 2 } },
    },
    {
      jsonrpc: '2.0',
      id: 39,
      method: 'tools/call',
      params: {
        name: 'infer_imports',
        arguments: {
          rootPath: REPO_ROOT,
          maxFiles: 5000,
          reviewMode: 'full',
          allowLargeResponse: true,
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 70,
      method: 'tools/call',
      params: {
        name: 'infer_imports',
        arguments: {
          rootPath: REPO_ROOT,
          reviewMode: 'focus',
          focusPath: 'src/entities/knowledge-graph/model/knowledge-graph.ts',
          focusDirection: 'both',
          focusLimit: 25,
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 69,
      method: 'tools/call',
      // absorb_document dry-run against the temp fixture: it needs no vault node, so it
      // joins the initial batch rather than the reactive dry-run smokes.
      params: {
        name: 'absorb_document',
        arguments: { filePath: ABSORB_FIXTURE_PATH, allowOutsideRepo: true },
      },
    },
    {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'workspace_brief', limit: 3 } },
    },
    {
      jsonrpc: '2.0',
      id: 66,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'agent_brief', limit: 3 } },
    },
    {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'health' } },
    },
    {
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'workspace_brief',
          limit: 3,
          ...VERIFY_TUNED_HEALTH_ARGS,
          nodeLimit: VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'health',
          ...VERIFY_TUNED_HEALTH_ARGS,
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'compile_ontology', arguments: { summary: true } },
    },
    {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: { name: 'compile_ontology', arguments: { nodesLimit: 1, edgesLimit: 1 } },
    },
    {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name: 'compile_ontology', arguments: { nodesLimit: 1, edgesLimit: 1, includeIndexes: true } },
    },
    {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'overview', limit: 5 } },
    },
    {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'overview' } },
    },
    {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'project_map' } },
    },
    {
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { lmit: 1 } },
    },
    {
      jsonrpc: '2.0',
      id: 27,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { lmit: 1, summry: true } },
    },
    {
      jsonrpc: '2.0',
      id: 65,
      method: 'tools/call',
      params: { name: 'list_concept', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 28,
      method: 'tools/call',
      params: {
        name: 'add_concepts',
        arguments: {
          concepts: [
            null,
            { slug: 'verify-row-isolation', kind: 'capability', title: 'Verify', titel: 'Typo', domian: 'Typo' },
            { slug: 'verify-duplicate-slug', kind: 'capabilty', title: 'Verify Duplicate' },
            { slug: 'verify-duplicate-slug', kind: 'capability', title: 'Verify Duplicate' },
            { slug: 'verify-single-field', kind: 'capability', title: 'Verify Single', titel: 'Typo' },
          ],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 29,
      method: 'tools/call',
      params: {
        name: 'add_relations',
        arguments: {
          relations: [
            null,
            { from: 'verify-row-isolation', to: 'verify-target', type: 'relates', relation: 'relates', frm: 'verify-row-isolation' },
            { from: 'verify-row-isolation', to: 'verify-target', type: 'depend_on' },
            { from: 'verify-row-isolation', to: 'verify-target', type: 'relates', relation: 'relates' },
          ],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: {
        name: 'add_concepts',
        arguments: {
          concepts: Array.from({ length: 51 }, (_, index) => ({
            slug: `verify-cap-${index}`,
            kind: 'capability',
            title: `Verify Cap ${index}`,
            domain: 'verify',
          })),
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: {
        name: 'add_relations',
        arguments: {
          relations: Array.from({ length: 51 }, () => ({
            from: 'verify-row-isolation',
            to: 'verify-target',
            type: 'relates',
          })),
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 64,
      method: 'tools/call',
      params: {
        name: 'get_concepts',
        arguments: {
          slugs: Array.from({ length: 51 }, (_, index) => `verify-slug-${index}`),
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'overveiw' } },
    },
    {
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', phases: ['repiar'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', severities: ['fatal'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 24,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', kinds: ['add_mising_relation'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'health', dependencyTypes: ['depend_on'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 46,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'relation_check',
          from: 'missing-relation-check-source',
          to: 'missing-relation-check-target',
          type: 'depend_on',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 47,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_nodes',
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'recommend_relations',
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'recommend_relations',
          kind: 'domain',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_nodes',
          sort: 'outDegre',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 54,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_edges',
          type: 'depend_on',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 56,
      method: 'tools/call',
      params: {
        name: 'find_orphans',
        arguments: {
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 57,
      method: 'tools/call',
      params: {
        name: 'find_orphans',
        arguments: {
          excludeKinds: ['capabilty'],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 58,
      method: 'tools/call',
      params: {
        name: 'query_concepts',
        arguments: {
          filter: 'kind=capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 59,
      method: 'tools/call',
      params: {
        name: 'query_concepts',
        arguments: {
          filter: 'has(capabilties)',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: {
        name: 'list_concepts',
        arguments: {
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 48,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_edges',
          fromKind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 49,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_edges',
          toKind: 'externl',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 25,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', afterActionId: 'maint_missing', limit: 5 },
      },
    },
    {
      jsonrpc: '2.0',
      id: 26,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', limit: 5 },
      },
    },
  ];
}
