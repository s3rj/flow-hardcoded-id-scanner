import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../bin/cli.js';

const root = fileURLToPath(new URL('..', import.meta.url));

function cli(...args) {
  const result = spawnSync(process.execPath, ['bin/cli.js', ...args], { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test('flows with hard-coded Ids fail the scan and are listed', () => {
  const { code, out } = cli('fixtures/dirty');

  assert.equal(code, 1);
  assert.match(out, /Hardcoded_Record_Type\.flow-meta\.xml/);
  assert.match(out, /012Hs000001AbCdIAK\s+RecordType\s+certain\s+decisions "Is_Escalated"/);
  assert.match(out, /005Hs000003Xyzw\s+User\s+likely/);
  assert.match(out, /3 hard-coded Ids in 2 of 2 files \(2 certain, 1 likely\)/);
  assert.match(out, /Custom Metadata/);
});

test('clean metadata passes, with and without --all', () => {
  assert.equal(cli('fixtures/clean').code, 0);
  const all = cli('fixtures/clean', '--all');
  assert.equal(all.code, 0);
  assert.match(all.out, /No hard-coded Ids in 3 files\./);
});

test('--all also scans validation rules, flexipages, and Apex', () => {
  const { code, out } = cli('fixtures/dirty', '--all', '--format', 'json');

  assert.equal(code, 1);
  const report = JSON.parse(out);
  assert.equal(report.summary.total, 8);
  assert.equal(report.summary.certain, 6);
  assert.equal(report.summary.likely, 2);
  assert.equal(report.summary.files, 5);
  assert.equal(report.summary.scanned, 5);
  assert.deepEqual(
    [...new Set(report.findings.map((f) => f.file.split('/').pop()))].sort(),
    ['Assign_Owner.flow-meta.xml', 'Escalated_Cases_Need_Queue.validationRule-meta.xml', 'Hardcoded_Record_Type.flow-meta.xml', 'OwnerAssignment.cls', 'Service_Home.flexipage-meta.xml'],
  );
});

test('an allowlist removes the accepted Id everywhere it appears', () => {
  const { out } = cli('fixtures/dirty', '--all', '--allow', 'fixtures/allow.txt', '--format', 'json');

  const report = JSON.parse(out);
  assert.equal(report.summary.total, 5);
  assert.ok(report.findings.every((f) => !f.id.startsWith('00GHs000002Qabc')));
});

test('--certain-only drops the 15-character findings', () => {
  const report = JSON.parse(cli('fixtures/dirty', '--certain-only', '--format', 'json').out);
  assert.equal(report.summary.total, 2);
  assert.ok(report.findings.every((f) => f.confidence === 'certain'));
});

test('--no-fail reports but exits 0', () => {
  const { code, out } = cli('fixtures/dirty', '--no-fail');
  assert.equal(code, 0);
  assert.match(out, /3 hard-coded Ids/);
});

test('--format github emits one annotation per finding', () => {
  const { out } = cli('fixtures/dirty', '--format', 'github');
  const annotations = out.split('\n').filter((line) => line.startsWith('::error '));
  assert.equal(annotations.length, 3);
  assert.match(annotations[0], /^::error file=fixtures\/dirty\/flows\/Assign_Owner\.flow-meta\.xml,line=\d+,col=\d+,title=Hard-coded Salesforce Id::Hard-coded User Id 005Hs000003Xyzw \(likely\) in assignments "Assign_Owner_To_Admin"\./);
});

test('usage errors exit 2 with the usage text', () => {
  const unknown = cli('--bogus');
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /Unknown option: --bogus/);
  assert.match(unknown.err, /Usage:/);

  const missing = cli('no/such/path');
  assert.equal(missing.code, 2);
  assert.match(missing.err, /No such file or directory: no\/such\/path/);

  const badFormat = cli('fixtures/clean', '--format', 'xml');
  assert.equal(badFormat.code, 2);
  assert.match(badFormat.err, /Unknown format: xml/);
});

test('--help exits 0 and the default path is force-app', () => {
  const { code, out } = cli('--help');
  assert.equal(code, 0);
  assert.match(out, /Usage: flow-hardcoded-id-scanner/);
  assert.deepEqual(parseArgs([]).paths, ['force-app']);
  assert.deepEqual(parseArgs(['--ext', '.cls, .trigger']).ext, ['.cls', '.trigger']);
});
