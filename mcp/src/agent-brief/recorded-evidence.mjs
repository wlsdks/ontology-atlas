export function markdownSection(body, heading) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const lines = body.split('\n');
  const wanted = String(heading).normalize('NFKC').toLocaleLowerCase('en-US');
  let collecting = false;
  let fence = null;
  const rows = [];
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    const opensFence = marker && (marker[1][0] === '~' || !marker[2].includes('`'));
    if (fence || opensFence) {
      if (!fence) fence = marker[1];
      else if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      if (collecting) rows.push(line);
      continue;
    }
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (collecting) break;
      collecting = match[1].normalize('NFKC').toLocaleLowerCase('en-US') === wanted;
      continue;
    }
    if (collecting) rows.push(line);
  }
  return rows.join('\n').trim();
}

export function completeMarkdownUnits(doc, section, role) {
  const source = markdownSection(doc?.body, section);
  if (!source) return [];
  const lines = source.split('\n');
  const hasTopLevelBullets = lines.some((line) => /^[-*]\s+\S/u.test(line));
  const texts = [];
  if (hasTopLevelBullets) {
    let withinBullet = false;
    const mixedTopLevelProse = lines.some((line) => {
      if (/^[-*]\s+\S/u.test(line)) {
        withinBullet = true;
        return false;
      }
      if (!line.trim() || (withinBullet && /^\s+\S/u.test(line))) return false;
      return true;
    });
    if (mixedTopLevelProse) {
      // Free prose can qualify any bullet, so keep the entire section.
      texts.push(source.trim());
    } else {
      let current = [];
      for (const line of lines) {
        if (/^[-*]\s+\S/u.test(line)) {
          if (current.length > 0) texts.push(current.join('\n').trim());
          current = [line];
        } else if (current.length > 0) {
          current.push(line);
        }
      }
      if (current.length > 0) texts.push(current.join('\n').trim());
    }
  } else {
    texts.push(source.trim());
  }
  return texts.map((text) => ({
    slug: doc.slug,
    section,
    role,
    text,
    locator: { slug: doc.slug, section, body: 'full' },
  }));
}

const UNCERTAINTY_UNIT_LIMIT = 8;

export function createUncertaintyPlan(docs, system) {
  // Counting is linear in scoped body text; delivery considers at most eight units.
  const sources = docs.map((doc) => ({
    slug: doc.slug,
    units: completeMarkdownUnits(doc, 'Uncertainty', 'uncertainty').map((row) => row.text),
  }));
  const candidates = [];
  for (let index = 0; candidates.length < UNCERTAINTY_UNIT_LIMIT; index += 1) {
    let found = false;
    for (const [sourceIndex, source] of sources.entries()) {
      if (index >= source.units.length) continue;
      found = true;
      candidates.push({ sourceIndex, text: source.units[index] });
      if (candidates.length === UNCERTAINTY_UNIT_LIMIT) break;
    }
    if (!found) break;
  }
  return { sources, candidates, system };
}

export function projectUncertainty(plan, included) {
  const unknowns = plan.system.map((row) => row.text);
  const sources = plan.sources.map((source) => ({
    slug: source.slug,
    status: source.units.length > 0 ? 'recorded' : 'not_recorded',
    totalUnits: source.units.length,
    omittedUnits: source.units.length,
    unknownIndexes: [],
  }));
  for (const row of included) {
    sources[row.sourceIndex].unknownIndexes.push(unknowns.length);
    sources[row.sourceIndex].omittedUnits -= 1;
    unknowns.push(row.text);
  }
  return {
    unknowns,
    uncertainty: {
      scope: 'selected_task_documents',
      sources,
      system: plan.system.map((row, unknownIndex) => ({ code: row.code, unknownIndex })),
    },
  };
}

export function formatUncertaintyLines(focus) {
  return [
    'Uncertainty scope: selected task documents; not_recorded means unknown.',
    ...focus.uncertainty.system.map((row) => `Unknown: ${JSON.stringify({ system: row.code, text: focus.unknowns[row.unknownIndex] })}`),
    ...focus.uncertainty.sources.flatMap((row) => [
      `Uncertainty: ${JSON.stringify(row.slug)} ${row.unknownIndexes.length}/${row.totalUnits} units; ${row.omittedUnits} omitted${row.status === 'not_recorded' ? '; not_recorded' : ''}.`,
      ...row.unknownIndexes.map((index) => `Unknown: ${JSON.stringify({ slug: row.slug, text: focus.unknowns[index] })}`),
    ]),
    'Recovery: require ok:true and bodyInfo.truncated:false; otherwise unknown.',
  ];
}
