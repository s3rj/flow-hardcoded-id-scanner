#!/usr/bin/env node
/**
 * flow-hardcoded-id-scanner: finds Salesforce record Ids hard-coded in Flow (and, with --all, other metadata).
 * Exit codes: 0 nothing found (or --no-fail), 1 Ids found, 2 bad usage.
 */
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ALL_SUFFIXES, FLOW_SUFFIXES, collectFiles, readAllowlist } from '../src/files.js';
import { formatGithub, formatJson, formatText } from '../src/report.js';
import { scanText } from '../src/scanner.js';

const USAGE = `Usage: flow-hardcoded-id-scanner [paths...] [options]

Scans Flow metadata (*.flow-meta.xml) under the given paths (default: force-app) for hard-coded record Ids.

Options:
  --all                 Also scan validation rules, formula fields, workflows, flexipages, quick actions,
                        approval processes, sharing rules, Visualforce, email templates, Apex classes and triggers
  --ext .a,.b           Scan files with exactly these suffixes instead
  --allow <file>        Allowlist: one Id per line (15 or 18 characters), # comments
  --certain-only        Report only 18-character Ids with a valid checksum
  --format <fmt>        text (default), json, or github (workflow annotations)
  --no-fail             Exit 0 even when Ids are found
  -h, --help            This text
`;

export function parseArgs(argv) {
  const options = { paths: [], all: false, ext: null, allow: null, certainOnly: false, format: 'text', fail: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--all':
        options.all = true;
        break;
      case '--ext':
        options.ext = requireValue(argv, ++i, arg).split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--allow':
        options.allow = requireValue(argv, ++i, arg);
        break;
      case '--certain-only':
        options.certainOnly = true;
        break;
      case '--format':
        options.format = requireValue(argv, ++i, arg);
        if (!['text', 'json', 'github'].includes(options.format)) {
          throw new UsageError(`Unknown format: ${options.format}`);
        }
        break;
      case '--no-fail':
        options.fail = false;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new UsageError(`Unknown option: ${arg}`);
        }
        options.paths.push(arg);
    }
  }
  if (options.paths.length === 0) {
    options.paths.push('force-app');
  }
  return options;
}

function requireValue(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('-')) {
    throw new UsageError(`${flag} needs a value`);
  }
  return argv[index];
}

class UsageError extends Error {}

export async function run(argv, out = process.stdout, err = process.stderr) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      err.write(`${e.message}\n\n${USAGE}`);
      return 2;
    }
    throw e;
  }
  if (options.help) {
    out.write(USAGE);
    return 0;
  }
  const suffixes = options.ext ?? (options.all ? ALL_SUFFIXES : FLOW_SUFFIXES);
  let files;
  try {
    files = await collectFiles(options.paths, suffixes);
  } catch (e) {
    err.write(`${e.message}\n`);
    return 2;
  }
  const allow = options.allow ? await readAllowlist(options.allow) : [];
  let findings = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    findings.push(...scanText(text, file, { allow }));
  }
  if (options.certainOnly) {
    findings = findings.filter((f) => f.confidence === 'certain');
  }
  const formatter = { text: formatText, json: formatJson, github: formatGithub }[options.format];
  out.write(`${formatter(findings, files.length)}\n`);
  return findings.length > 0 && options.fail ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`${e.stack ?? e}\n`);
      process.exit(2);
    },
  );
}
