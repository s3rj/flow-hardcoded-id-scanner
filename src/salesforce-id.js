/**
 * What a Salesforce record Id looks like, and how sure we can be that a token is one.
 *
 * A record Id is 15 characters of base62: a 3-character key prefix that names the object, 2 characters for the
 * instance (pod) the record was created on, a reserved character that is currently always "0", and 9 unique
 * characters. The 18-character form appends a 3-character checksum that encodes which of the first 15 characters
 * are upper case, so an 18-character token with a valid checksum is an Id beyond reasonable doubt, and a
 * 15-character token with a known prefix and the reserved "0" in place is very likely one.
 */

/** Key prefixes that show up hard-coded in metadata. Custom objects use "a" plus two characters; custom metadata records "m0" plus one. */
export const KEY_PREFIXES = Object.freeze({
  '001': 'Account',
  '003': 'Contact',
  '005': 'User',
  '006': 'Opportunity',
  '00D': 'Organization',
  '00E': 'UserRole',
  '00G': 'Group (queue or public group)',
  '00k': 'OpportunityLineItem',
  '00l': 'Folder',
  '00O': 'Report',
  '00P': 'Attachment',
  '00Q': 'Lead',
  '00T': 'Task',
  '00U': 'Event',
  '00v': 'CampaignMember',
  '00X': 'EmailTemplate',
  '00e': 'Profile',
  '012': 'RecordType',
  '015': 'Document',
  '01s': 'Pricebook2',
  '01t': 'Product2',
  '01u': 'PricebookEntry',
  '01Z': 'Dashboard',
  '02i': 'Asset',
  '068': 'ContentVersion',
  '069': 'ContentDocument',
  '0PS': 'PermissionSet',
  '0Q0': 'Quote',
  '300': 'FlowDefinition',
  '301': 'Flow',
  '500': 'Case',
  '501': 'Solution',
  '701': 'Campaign',
  '800': 'Contract',
  '801': 'Order',
  '802': 'OrderItem',
});

const CHECKSUM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
const ID_SHAPE = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;

/** The 3-character suffix Salesforce appends to a 15-character Id to make it case-insensitive. */
export function checksum(id15) {
  let out = '';
  for (let block = 0; block < 3; block++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const c = id15[block * 5 + i];
      if (c >= 'A' && c <= 'Z') {
        bits |= 1 << i;
      }
    }
    out += CHECKSUM_ALPHABET[bits];
  }
  return out;
}

/** The object a key prefix belongs to, or null when it is not one we recognise. */
export function objectFor(prefix) {
  if (Object.hasOwn(KEY_PREFIXES, prefix)) {
    return KEY_PREFIXES[prefix];
  }
  if (/^a[A-Za-z0-9]{2}$/.test(prefix)) {
    return `Custom object (prefix ${prefix})`;
  }
  if (/^m0[A-Za-z0-9]$/.test(prefix)) {
    return 'Custom metadata record';
  }
  return null;
}

/**
 * Decides whether a token is a Salesforce Id.
 * Returns { id, prefix, object, confidence } with confidence "certain" (18 characters, checksum valid) or
 * "likely" (15 characters, known prefix, reserved character in place), or null when the token is not an Id.
 */
export function classify(token) {
  if (!ID_SHAPE.test(token)) {
    return null;
  }
  const prefix = token.slice(0, 3);
  const object = objectFor(prefix);
  if (token.length === 18) {
    if (checksum(token.slice(0, 15)) !== token.slice(15).toUpperCase()) {
      return null;
    }
    return { id: token, prefix, object: object ?? 'Salesforce record (unknown object)', confidence: 'certain' };
  }
  if (object === null || token[5] !== '0') {
    return null;
  }
  return { id: token, prefix, object, confidence: 'likely' };
}

/** Two Ids are the same record when their first 15 characters match, whatever the suffix. */
export function sameRecord(a, b) {
  return a.slice(0, 15) === b.slice(0, 15);
}
