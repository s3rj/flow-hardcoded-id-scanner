/**
 * Output formats: text for people, json for tooling, github for workflow annotations.
 */

export const ADVICE =
  'Replace each Id with something that survives a deployment: a Custom Metadata record, a Custom Label, a custom setting ($Setup), ' +
  'a Get Records by DeveloperName, or $Permission / $UserRole in formulas.';

export function summarize(findings, scannedCount) {
  const certain = findings.filter((f) => f.confidence === 'certain').length;
  return {
    scanned: scannedCount,
    files: new Set(findings.map((f) => f.file)).size,
    total: findings.length,
    certain,
    likely: findings.length - certain,
  };
}

export function formatText(findings, scannedCount) {
  const summary = summarize(findings, scannedCount);
  if (findings.length === 0) {
    return `No hard-coded Ids in ${scannedCount} file${scannedCount === 1 ? '' : 's'}.`;
  }
  const lines = [];
  let current = null;
  for (const f of findings) {
    if (f.file !== current) {
      current = f.file;
      lines.push(current);
    }
    const where = f.element ? `${f.elementType} "${f.element}"` : f.elementType ?? '';
    const path = f.path && f.path !== f.elementType ? ` (${f.path})` : '';
    lines.push(`  line ${String(f.line).padEnd(5)} ${f.id.padEnd(18)}  ${f.object.padEnd(30)}  ${f.confidence.padEnd(7)}  ${where}${path}`.trimEnd());
  }
  lines.push('');
  lines.push(
    `${summary.total} hard-coded Id${summary.total === 1 ? '' : 's'} in ${summary.files} of ${summary.scanned} file${summary.scanned === 1 ? '' : 's'} ` +
      `(${summary.certain} certain, ${summary.likely} likely).`,
  );
  lines.push(ADVICE);
  return lines.join('\n');
}

export function formatJson(findings, scannedCount) {
  return JSON.stringify({ summary: summarize(findings, scannedCount), findings }, null, 2);
}

/** GitHub Actions workflow commands: each finding becomes an annotation on the file and line. */
export function formatGithub(findings, scannedCount) {
  const lines = findings.map((f) => {
    const where = f.element ? ` in ${f.elementType} "${f.element}"` : '';
    const message = `Hard-coded ${f.object} Id ${f.id} (${f.confidence})${where}. ${ADVICE}`;
    return `::error file=${f.file},line=${f.line},col=${f.column},title=Hard-coded Salesforce Id::${escape(message)}`;
  });
  lines.push(formatText(findings, scannedCount).split('\n').slice(-2).join(' '));
  return lines.join('\n');
}

function escape(message) {
  return message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
