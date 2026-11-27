/** The middle value; the mean of the two middle values for an even count; null for none. */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The samples that succeeded, how many failed, and the median of each named measure over the
 * successful ones. A failed sample is kept in `samples` and never enters a median.
 */
export function summarizeSamples(samples, measures) {
  const succeeded = samples.filter((sample) => sample.ok);
  return {
    samples,
    failedCount: samples.length - succeeded.length,
    median: Object.fromEntries(measures.map((measure) => [measure, median(succeeded.map((sample) => sample[measure]))])),
  };
}
