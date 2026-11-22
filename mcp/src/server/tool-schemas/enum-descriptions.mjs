import { IMPORT_EDGE_KIND_VALUES } from '../../infer-imports.mjs';
import { NODE_KIND_VALUES } from '../../ontology-engine.mjs';

const IMPORT_EDGE_KIND_DESCRIPTION = IMPORT_EDGE_KIND_VALUES.join(', ');
const NODE_KIND_DESCRIPTION = NODE_KIND_VALUES.join(', ');

export {
  IMPORT_EDGE_KIND_DESCRIPTION,
  NODE_KIND_DESCRIPTION,
};
