import test from 'node:test';
import assert from 'node:assert/strict';
import { checksum, classify, objectFor, sameRecord } from '../src/salesforce-id.js';

test('checksum matches the suffixes Salesforce produces', () => {
  assert.equal(checksum('00D000000000062'), 'EAA'); // the org Id from the platform docs
  assert.equal(checksum('0015g00000AbCdE'), 'AAV');
  assert.equal(checksum('abcdefghijklmno'), 'AAA'); // no upper-case letters at all
  assert.equal(checksum('ABCDEFGHIJKLMNO'), '555'); // every letter upper-case
});

test('an 18-character token with a valid checksum is certainly an Id', () => {
  const match = classify('0015g00000AbCdEAAV');
  assert.deepEqual(match, { id: '0015g00000AbCdEAAV', prefix: '001', object: 'Account', confidence: 'certain' });
  assert.equal(classify('0015g00000AbCdEaav').confidence, 'certain', 'suffix case does not matter');
});

test('an 18-character token with a bad checksum is not an Id', () => {
  assert.equal(classify('0015g00000AbCdEAAA'), null);
  assert.equal(classify('0015g00000AbCdEXYZ'), null);
});

test('a 15-character token needs a known prefix and the reserved zero', () => {
  assert.deepEqual(classify('0015g00000AbCdE'), { id: '0015g00000AbCdE', prefix: '001', object: 'Account', confidence: 'likely' });
  assert.equal(classify('ZZZ5g00000AbCdE'), null, 'unknown prefix');
  assert.equal(classify('0015gX0000AbCdE'), null, 'sixth character is not the reserved zero');
  assert.equal(classify('a0X5g00000AbCdE').object, 'Custom object (prefix a0X)');
  assert.equal(classify('m005g00000AbCdE').object, 'Custom metadata record');
});

test('tokens of the wrong shape are not Ids', () => {
  for (const token of ['Hello', '0015g00000AbCd', '0015g00000AbCdEA', '0015g00000AbCdEAAVX', '0015g00000AbCd-', '']) {
    assert.equal(classify(token), null, token);
  }
});

test('an unknown prefix is still reported when the checksum proves the Id', () => {
  const token = `ZZZ5g00000AbCdE${checksum('ZZZ5g00000AbCdE')}`;
  assert.equal(classify(token).object, 'Salesforce record (unknown object)');
  assert.equal(classify(token).confidence, 'certain');
});

test('objectFor knows the common prefixes', () => {
  assert.equal(objectFor('012'), 'RecordType');
  assert.equal(objectFor('00G'), 'Group (queue or public group)');
  assert.equal(objectFor('500'), 'Case');
  assert.equal(objectFor('Abc'), null, 'custom object prefixes are lower-case a');
});

test('sameRecord compares the 15 significant characters', () => {
  assert.equal(sameRecord('0015g00000AbCdE', '0015g00000AbCdEAAV'), true);
  assert.equal(sameRecord('0015g00000AbCdE', '0015g00000AbCdF'), false);
});
