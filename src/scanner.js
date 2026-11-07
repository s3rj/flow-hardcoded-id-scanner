/**
 * Finds Salesforce record Ids in metadata text. XML files are walked tag by tag so a finding can say which flow
 * element it sits in and where (decisions > rules > conditions > rightValue > stringValue); other files are
 * scanned as plain text.
 */
import { classify, sameRecord } from './salesforce-id.js';

const TOKEN_RE = /(?<![A-Za-z0-9])[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?(?![A-Za-z0-9])/g;
const XML_RE = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)(?:\s[^>]*?)?(\/?)>/g;
/** Tags whose text names the enclosing element, for the report. */
const NAME_TAGS = new Set(['name', 'fullName']);

export function isXml(file) {
  return /\.xml$/i.test(file);
}

/**
 * Scans one file's text. Returns findings, in document order:
 * { file, line, column, id, object, confidence, element, elementType, path, snippet }.
 */
export function scanText(text, file, options = {}) {
  const lines = lineIndex(text);
  const allow = options.allow ?? [];
  const findings = [];
  const pending = []; // element labels can appear after the Id in the XML, so they are resolved at the end

  const report = (token, index, context) => {
    const match = classify(token);
    if (match === null || allow.some((allowed) => sameRecord(allowed, token))) {
      return;
    }
    const { line, column } = lines.locate(index);
    const finding = {
      file,
      line,
      column,
      id: match.id,
      object: match.object,
      confidence: match.confidence,
      element: null,
      elementType: context?.elementType ?? null,
      path: context?.path ?? null,
      snippet: lines.text(line).trim().slice(0, 160),
    };
    findings.push(finding);
    if (context?.entry) {
      pending.push({ finding, entry: context.entry });
    }
  };

  if (isXml(file)) {
    walkXml(text, report);
    for (const { finding, entry } of pending) {
      finding.element = entry.label;
    }
  } else {
    for (const m of text.matchAll(TOKEN_RE)) {
      report(m[0], m.index, null);
    }
  }
  return findings;
}

/** Walks the XML, scanning text nodes with the stack of enclosing tags as context. */
function walkXml(text, report) {
  const stack = []; // { name, label }
  let pos = 0;
  const scanSegment = (segment, offset) => {
    for (const m of segment.matchAll(TOKEN_RE)) {
      report(m[0], offset + m.index, contextFor(stack));
    }
  };
  for (const m of text.matchAll(XML_RE)) {
    if (m.index > pos) {
      const segment = text.slice(pos, m.index);
      scanSegment(segment, pos);
      rememberName(stack, segment);
    }
    pos = m.index + m[0].length;
    const [whole, cdata, closing, name, selfClosing] = m;
    if (whole.startsWith('<!--') || whole.startsWith('<?')) {
      continue;
    }
    if (cdata !== undefined) {
      scanSegment(cdata, m.index + '<![CDATA['.length);
      rememberName(stack, cdata);
      continue;
    }
    if (closing === '/') {
      while (stack.length > 0) {
        if (stack.pop().name === name) {
          break;
        }
      }
    } else if (selfClosing !== '/') {
      stack.push({ name, label: null });
    }
  }
  if (pos < text.length) {
    scanSegment(text.slice(pos), pos);
  }
}

/**
 * A <name> directly under a top-level element names that element (<Flow><decisions><name>Is_Escalated</name>);
 * a <fullName> directly under the root names the file's component.
 */
function rememberName(stack, segment) {
  const depth = stack.length;
  if ((depth === 3 || depth === 2) && NAME_TAGS.has(stack[depth - 1].name)) {
    const owner = stack[depth - 2];
    const value = segment.trim();
    if (owner.label === null && value !== '') {
      owner.label = value;
    }
  }
}

function contextFor(stack) {
  if (stack.length === 0) {
    return null;
  }
  const entry = stack.length > 1 ? stack[1] : stack[0];
  return {
    entry,
    elementType: entry.name,
    path: (stack.length > 1 ? stack.slice(1) : stack).map((e) => e.name).join(' > '),
  };
}

/** Line and column lookup for character offsets. */
function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return {
    locate(index) {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= index) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return { line: lo + 1, column: index - starts[lo] + 1 };
    },
    text(line) {
      const start = starts[line - 1];
      const end = line < starts.length ? starts[line] - 1 : text.length;
      return text.slice(start, end);
    },
  };
}
