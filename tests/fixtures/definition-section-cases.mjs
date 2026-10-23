export const definitionSectionCases = [
  { name: 'canonical definition', body: '## Definition\n\nRetries a read,\nbut never writes a report.\n\n## Includes\nRetry logging.', expected: 'Retries a read, but never writes a report.' },
  { name: 'titled canonical definition', body: '# Retry\n\n## Definition\n\nRetries only with approval.', expected: 'Retries only with approval.' },
  { name: 'empty definition', body: '## Definition\n\n## Includes\nWrites reports.', expected: undefined },
  { name: 'overlong definition', body: '## Definition\n\n' + 'A retry is allowed. '.repeat(20) + 'But only with approval.', expected: undefined },
];
