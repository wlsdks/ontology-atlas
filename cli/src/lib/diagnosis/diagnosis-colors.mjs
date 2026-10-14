export function diagnosisStatusColor(status, colors) {
  if (status === 'healthy') return colors.green;
  if (status === 'needs_attention') return colors.yellow;
  return colors.dim;
}

export function healthCheckStatusColor(status, colors) {
  if (status === 'pass') return colors.green;
  if (status === 'fail') return colors.red;
  if (status === 'warn') return colors.yellow;
  if (status === 'info') return colors.dim;
  return colors.dim;
}
