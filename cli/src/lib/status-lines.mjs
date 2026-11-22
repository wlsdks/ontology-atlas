import { stderr, stdout } from 'node:process';
import { COLORS } from './colors.mjs';

export function ok(message) {
  stdout.write(`${COLORS.green}ok${COLORS.reset}    ${message}\n`);
}

export function info(message) {
  stdout.write(`${COLORS.cyan}info${COLORS.reset}  ${message}\n`);
}

export function warn(message) {
  stdout.write(`${COLORS.yellow}warn${COLORS.reset}  ${message}\n`);
}

export function fail(message) {
  stderr.write(`${COLORS.bold}error${COLORS.reset} ${message}\n`);
}
