/**
 * Which files to scan. Flows by default; with --all, the other metadata types where Ids get hard-coded, plus Apex.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const FLOW_SUFFIXES = ['.flow-meta.xml'];
export const ALL_SUFFIXES = [
  ...FLOW_SUFFIXES,
  '.validationRule-meta.xml',
  '.field-meta.xml',
  '.workflow-meta.xml',
  '.flexipage-meta.xml',
  '.quickAction-meta.xml',
  '.approvalProcess-meta.xml',
  '.sharingRules-meta.xml',
  '.email',
  '.page',
  '.component',
  '.cls',
  '.trigger',
];
const SKIPPED_DIRS = new Set(['node_modules', '.git', '.sfdx', '.sf', '.github']);

/** Expands files and directories into the list of files whose names end with one of the suffixes. */
export async function collectFiles(inputs, suffixes) {
  const files = [];
  for (const input of inputs) {
    const stat = await fs.stat(input).catch(() => null);
    if (stat === null) {
      throw new Error(`No such file or directory: ${input}`);
    }
    if (stat.isFile()) {
      files.push(input);
    } else {
      await walk(input, suffixes, files);
    }
  }
  return files.sort();
}

async function walk(dir, suffixes, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        await walk(full, suffixes, out);
      }
    } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
      out.push(full);
    }
  }
}

/** Reads an allowlist: one Id per line, "#" starts a comment, blank lines ignored. */
export async function readAllowlist(file) {
  const text = await fs.readFile(file, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line !== '');
}
