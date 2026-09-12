#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { writePoPilotFragment } from './lib/po-pilot-records.mjs';

export function runPoRecord(argv, io = console) {
  try {
    const type = argv.find((arg) => arg.startsWith('--type='))?.slice(7);
    const file = argv.find((arg) => arg.startsWith('--input='))?.slice(8);
    if (!type || !file) throw new Error('usage: po-record --type=run|update|policy --input=<json>');
    const result = writePoPilotFragment(type, JSON.parse(readFileSync(file, 'utf8')));
    io.log(JSON.stringify(result));
    return 0;
  } catch (error) {
    io.error(error.message.startsWith('[po-pilot-records]') ? error.message : `[po-record] ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = runPoRecord(process.argv.slice(2));
