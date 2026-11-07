import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanText } from '../src/scanner.js';

const fixture = (relative) => readFileSync(new URL(`../fixtures/${relative}`, import.meta.url), 'utf8');

test('a flow decision and record update with hard-coded Ids are both found, with their element names', () => {
  const file = 'fixtures/dirty/flows/Hardcoded_Record_Type.flow-meta.xml';
  const findings = scanText(fixture('dirty/flows/Hardcoded_Record_Type.flow-meta.xml'), file);

  assert.equal(findings.length, 2);
  const [recordType, queue] = findings;
  assert.equal(recordType.id, '012Hs000001AbCdIAK');
  assert.equal(recordType.object, 'RecordType');
  assert.equal(recordType.confidence, 'certain');
  assert.equal(recordType.elementType, 'decisions');
  assert.equal(recordType.element, 'Is_Escalated');
  assert.equal(recordType.path, 'decisions > rules > conditions > rightValue > stringValue');
  assert.equal(recordType.line, 17);
  assert.equal(recordType.file, file);
  assert.match(recordType.snippet, /012Hs000001AbCdIAK/);

  assert.equal(queue.id, '00GHs000002QabcMAC');
  assert.equal(queue.object, 'Group (queue or public group)');
  assert.equal(queue.elementType, 'recordUpdates');
  assert.equal(queue.element, 'Set_Owner');
  assert.equal(queue.path, 'recordUpdates > inputAssignments > value > stringValue');
});

test('a 15-character Id in an assignment is reported as likely', () => {
  const findings = scanText(fixture('dirty/flows/Assign_Owner.flow-meta.xml'), 'Assign_Owner.flow-meta.xml');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, '005Hs000003Xyzw');
  assert.equal(findings[0].object, 'User');
  assert.equal(findings[0].confidence, 'likely');
  assert.equal(findings[0].element, 'Assign_Owner_To_Admin');
});

test('tokens that merely look like Ids are left alone', () => {
  assert.deepEqual(scanText(fixture('clean/flows/Lookalikes.flow-meta.xml'), 'Lookalikes.flow-meta.xml'), []);
  assert.deepEqual(scanText(fixture('clean/flows/Case_Routing.flow-meta.xml'), 'Case_Routing.flow-meta.xml'), []);
});

test('the element name is found even when it comes after the Id in the XML', () => {
  const findings = scanText(fixture('dirty/flexipages/Service_Home.flexipage-meta.xml'), 'Service_Home.flexipage-meta.xml');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].object, 'Dashboard');
  assert.equal(findings[0].elementType, 'flexiPageRegions');
  assert.equal(findings[0].element, 'main');
});

test('escaped formulas in validation rules are scanned', () => {
  const findings = scanText(fixture('dirty/objects/Case/validationRules/Escalated_Cases_Need_Queue.validationRule-meta.xml'), 'rule.validationRule-meta.xml');

  assert.deepEqual(findings.map((f) => f.object), ['RecordType', 'Group (queue or public group)']);
  assert.equal(findings[0].elementType, 'errorConditionFormula');
});

test('non-XML files are scanned as plain text', () => {
  const findings = scanText(fixture('dirty/classes/OwnerAssignment.cls'), 'OwnerAssignment.cls');

  assert.deepEqual(findings.map((f) => [f.id, f.confidence, f.line]), [
    ['00GHs000002QabcMAC', 'certain', 3],
    ['0PSHs000000Mnop', 'likely', 4],
  ]);
  assert.equal(findings[0].element, null);
  assert.equal(findings[0].path, null);
});

test('the allowlist suppresses an Id in either form', () => {
  const text = fixture('dirty/flows/Hardcoded_Record_Type.flow-meta.xml');
  assert.equal(scanText(text, 'f.flow-meta.xml', { allow: ['00GHs000002Qabc'] }).length, 1, '15-character allow entry');
  assert.equal(scanText(text, 'f.flow-meta.xml', { allow: ['012Hs000001AbCdIAK', '00GHs000002QabcMAC'] }).length, 0, '18-character allow entries');
});

test('CDATA is scanned and comments are not', () => {
  const xml = `<?xml version="1.0"?>\n<Flow>\n  <!-- example: 012Hs000001AbCdIAK -->\n  <formulas>\n    <name>F</name>\n    <expression><![CDATA[CASE(RecordTypeId, "00GHs000002QabcMAC", 1, 0)]]></expression>\n  </formulas>\n</Flow>\n`;
  const findings = scanText(xml, 'f.flow-meta.xml');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, '00GHs000002QabcMAC');
  assert.equal(findings[0].element, 'F');
  assert.equal(findings[0].line, 6);
});

test('an Id glued to other characters is not matched twice or partially', () => {
  const xml = `<Flow><a><name>X</name><v>prefix012Hs000001AbCdIAKsuffix</v><w>012Hs000001AbCdIAK 012Hs000001AbCd</w></a></Flow>`;
  const findings = scanText(xml, 'f.flow-meta.xml');

  assert.deepEqual(findings.map((f) => f.id), ['012Hs000001AbCdIAK', '012Hs000001AbCd']);
});
