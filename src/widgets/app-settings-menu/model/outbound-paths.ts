type OutboundTrigger = 'automatic' | 'press' | 'agent-use';

type OutboundCarries = 'no-folder-content' | 'what-you-send' | 'provider-owned';

const OUTBOUND_AUDIT_LOG = '.ontology-atlas/llm-audit.jsonl';

export const OUTBOUND_DESTINATION_PLACEHOLDERS = [
  'your-runner-address',
  'npm-registry',
  'python-package-index',
  'your-connector-urls',
  'your-git-remote',
  'your-coding-tool-provider',
] as const;

export type OutboundDestinationPlaceholder = (typeof OUTBOUND_DESTINATION_PLACEHOLDERS)[number];

export interface OutboundPath {
  id: string;
  trigger: OutboundTrigger;
  hosts: readonly (string | OutboundDestinationPlaceholder)[];
  carries: OutboundCarries;
  recordedIn: typeof OUTBOUND_AUDIT_LOG | null;
}

export const OUTBOUND_PATHS: readonly OutboundPath[] = [
  {
    id: 'update-check',
    trigger: 'automatic',
    hosts: ['ontologyatlas.com'],
    carries: 'no-folder-content',
    recordedIn: null,
  },
  {
    id: 'model-providers',
    trigger: 'press',
    hosts: ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com'],
    carries: 'what-you-send',
    recordedIn: OUTBOUND_AUDIT_LOG,
  },
  {
    id: 'local-runner',
    trigger: 'press',
    hosts: ['your-runner-address'],
    carries: 'what-you-send',
    recordedIn: OUTBOUND_AUDIT_LOG,
  },
  {
    id: 'jev',
    trigger: 'press',
    hosts: ['api.typesafe.ai'],
    carries: 'what-you-send',
    recordedIn: OUTBOUND_AUDIT_LOG,
  },
  {
    id: 'tool-downloads',
    trigger: 'press',
    hosts: ['nodejs.org', 'npm-registry'],
    carries: 'no-folder-content',
    recordedIn: null,
  },
  {
    id: 'adapter-packages',
    trigger: 'press',
    hosts: ['npm-registry', 'python-package-index'],
    carries: 'no-folder-content',
    recordedIn: null,
  },
  {
    id: 'connectors',
    trigger: 'agent-use',
    hosts: ['your-connector-urls'],
    carries: 'what-you-send',
    recordedIn: null,
  },
  {
    id: 'git-remote',
    trigger: 'press',
    hosts: ['your-git-remote'],
    carries: 'what-you-send',
    recordedIn: null,
  },
  {
    id: 'coding-tools',
    trigger: 'agent-use',
    hosts: ['your-coding-tool-provider'],
    carries: 'provider-owned',
    recordedIn: null,
  },
];

export const WEB_OUTBOUND_PATHS: readonly OutboundPath[] = [
  {
    id: 'website-files',
    trigger: 'automatic',
    hosts: ['ontologyatlas.com'],
    carries: 'no-folder-content',
    recordedIn: null,
  },
];

export const OUTBOUND_HOST_EXCEPTIONS: readonly { host: string; reason: string }[] = [];
