import {
  initializeInstructionsFailure,
  initializeToolInventoryFailure,
} from '../checks/initialize.mjs';
import { log } from '../output.mjs';
import {
  EXPECTED_TOOLS,
  toolsListAnnotationSummary,
  toolsListInventoryFailure,
} from '../tools-list/inventory.mjs';
import { advertisedOutputSchemaFailure, withOutputContracts } from '../tools-list/output-contracts.mjs';
import {
  TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY,
  toolsListSchemaFailure,
} from '../tools-list/schema.mjs';

export function verifyHandshake(responses, { initRes }) {
  const listRes = responses.find((r) => r.id === 2);
  const instructionFailure = initializeInstructionsFailure(initRes);
  if (instructionFailure) {
    log('fail', instructionFailure);
    return false;
  }
  log('ok', 'initialize instructions: tool inventory, construction card, write sequence and guide pointer present');

  if (!listRes || !listRes.result?.tools) {
    log('fail', 'no tools/list response');
    return false;
  }
  const inventoryFailure = toolsListInventoryFailure(listRes.result.tools);
  if (inventoryFailure) {
    log('fail', inventoryFailure);
    return false;
  }
  const initializeInventoryFailure = initializeToolInventoryFailure(initRes, listRes.result.tools);
  if (initializeInventoryFailure) {
    log('fail', initializeInventoryFailure);
    return false;
  }
  const toolNames = listRes.result.tools.map((t) => t.name).sort();
  log('ok', `tools/list ${toolNames.length}/${EXPECTED_TOOLS.length} (${toolsListAnnotationSummary(listRes.result.tools)}): ${toolNames.join(' · ')}`);
  log('ok', 'tools/list inventory names: missing/extra/duplicate/invalid checks passed');
  log('ok', 'initialize tool inventory: counts and read/write names match tools/list exactly');
  const advertisedFailure = advertisedOutputSchemaFailure(listRes.result.tools);
  if (advertisedFailure) {
    log('fail', advertisedFailure);
    return false;
  }
  log('ok', 'tools/list output schemas: each is the top-level cut of its full result contract');
  const schemaFailure = toolsListSchemaFailure(withOutputContracts(listRes.result.tools));
  if (schemaFailure) {
    log('fail', schemaFailure);
    return false;
  }
  log('ok', `tools/list schema contract: ${TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY}`);
  return true;
}
