# flow-hardcoded-id-scanner

[![CI](https://github.com/s3rj/flow-hardcoded-id-scanner/actions/workflows/ci.yml/badge.svg)](https://github.com/s3rj/flow-hardcoded-id-scanner/actions/workflows/ci.yml)
![Node 18+](https://img.shields.io/badge/node-18%2B-339933)
![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
[![MIT License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

A command-line scanner and GitHub Action that finds Salesforce record Ids hard-coded in Flow metadata, and optionally in validation rules, formula fields, workflows, Lightning pages, Visualforce, and Apex. Zero dependencies, runs in a second, fails the build with an annotation on every offending line.

```
fixtures/dirty/flows/Hardcoded_Record_Type.flow-meta.xml
  line 17    012Hs000001AbCdIAK  RecordType                      certain  decisions "Is_Escalated" (decisions > rules > conditions > rightValue > stringValue)
  line 49    00GHs000002QabcMAC  Group (queue or public group)   certain  recordUpdates "Set_Owner" (recordUpdates > inputAssignments > value > stringValue)

3 hard-coded Ids in 2 of 2 files (2 certain, 1 likely).
Replace each Id with something that survives a deployment: a Custom Metadata record, a Custom Label, a custom setting ($Setup), a Get Records by DeveloperName, or $Permission / $UserRole in formulas.
```

## Why an org needs it

Record Ids are per org. The Record Type, queue, user, or dashboard an admin pasted into a decision element exists in production with one Id and in every sandbox with another, so the flow deploys without complaint and fails on the first record. Nobody notices until a refresh, a new sandbox, or a go-live, and then someone spends an afternoon hunting through Flow Builder. The same Ids hide in validation-rule formulas, Lightning page dashboard components, and Apex constants. The fix is well known (reference things by API name); the problem is finding them all, and keeping them from coming back.

## What your org gets

- **A CI gate.** Add one step to the pull-request workflow and a hard-coded Id can no longer be merged. Each finding is an annotation on the exact file and line in the pull request.
- **A refactor list.** Run it once against the whole repo (or a retrieve of production) and you have the complete, prioritized list for the tech-debt review: which element of which flow, which object the Id points at, and how sure the scanner is.
- **Confidence you can act on.** An 18-character Id has a checksum, and the scanner verifies it, so those findings are certain. A 15-character token is reported only when its key prefix names a real object and the reserved sixth character is in place, and it is labelled "likely".
- **Nothing to install in the org.** It reads metadata files, so it works on any SFDX repo, any retrieve, any branch, with no org access.
- **An allowlist for the exceptions**, with a comment per Id, so the gate stays green while the cleanup is scheduled and nobody loses track of what was accepted and why.

## Use it

In any SFDX project:

```bash
npx github:s3rj/flow-hardcoded-id-scanner                 # flows under force-app
npx github:s3rj/flow-hardcoded-id-scanner force-app --all # plus validation rules, fields, workflows, flexipages, Visualforce, Apex
npx github:s3rj/flow-hardcoded-id-scanner --format json   # for tooling
```

Or clone it and run `node bin/cli.js <paths>`. Exit code 1 means Ids were found (0 with `--no-fail`), 2 means a usage error.

| Option | Meaning |
|---|---|
| `paths...` | Files or directories; default `force-app` |
| `--all` | Scan every metadata type listed above, not only flows |
| `--ext .a,.b` | Scan exactly these file suffixes instead |
| `--allow <file>` | One accepted Id per line, 15 or 18 characters, `#` comments |
| `--certain-only` | Report only 18-character Ids with a valid checksum |
| `--format text\|json\|github` | People, tooling, or GitHub annotations |
| `--no-fail` | Report but exit 0 |

As a GitHub Action:

```yaml
- uses: actions/checkout@v4
- uses: s3rj/flow-hardcoded-id-scanner@main
  with:
    path: force-app
    all-metadata: 'true'
    allowlist: .hardcoded-ids-allow.txt   # optional
```

## What it finds, and how

| Token | Verdict | Why |
|---|---|---|
| `012Hs000001AbCdIAK` | certain, RecordType | 18 characters and the suffix `IAK` is the checksum of the first 15 |
| `0015g00000AbCdEAAA` | not an Id | 18 characters but the checksum does not match |
| `005Hs000003Xyzw` | likely, User | 15 characters, `005` is the User prefix, the sixth character is the reserved `0` |
| `ZZZ5g00000AbCdE` | not an Id | unknown key prefix |
| `001Hs1000001Abc` | not an Id | the reserved sixth character is not `0` |
| `a0XHs000001Kqrt` | likely, custom object | custom objects use `a` plus two characters; `m0x` is a custom metadata record |

The scanner knows the prefixes that show up hard-coded most often (Account, Contact, User, Group, RecordType, Profile, PermissionSet, Dashboard, Report, EmailTemplate, Folder, Pricebook, and so on). An 18-character Id with an unknown prefix is still reported when its checksum proves it is an Id.

XML is walked tag by tag, so a finding names the flow element it sits in (`decisions "Is_Escalated"`) and the path to the value. Comments are skipped, CDATA and escaped formulas are scanned, and a token glued to other characters is not matched.

## Fix what it finds

| Hard-coded | Use instead |
|---|---|
| Record Type Id in a decision or assignment | Get Records on `RecordType` by `DeveloperName` and `SobjectType`, or the `$Record.RecordType.DeveloperName` field in a formula |
| Queue or public group Id as the owner | Get Records on `Group` by `DeveloperName`, or a Custom Metadata record that names the queue per environment |
| User Id | A Custom Metadata record or a custom setting, so the value is per org |
| Profile or Permission Set Id in a formula | `$Profile.Name`, `$Permission.Custom_Permission` |
| Dashboard or Report Id in a Lightning page | A Dashboard component configured by name, or a Custom Label the page reads |
| Any Id in Apex | A Custom Metadata record, a Custom Label, or a query by `DeveloperName` cached in a static |

## Limits

- **It reads files, not the org.** Ids that live in data (custom setting records, Custom Metadata record values) are the org's business; this scans what is in version control.
- **15-character tokens are heuristics.** A real Id whose prefix the scanner does not know, or an org whose Ids no longer carry the reserved zero, would be missed at 15 characters; the 18-character checksum has no such gap, and the Flow Builder, formulas, and most copy-pastes produce 18-character Ids.
- **It does not parse formulas or Apex semantically.** It finds Id literals; it cannot tell whether a particular literal is harmless.

## Development

```bash
npm test                               # node --test, no dependencies
node bin/cli.js fixtures/dirty --all   # the fixtures the tests use, as a human sees them
```

CI runs the tests on Node 18, 20, and 22, checks that the clean fixtures pass and the dirty ones fail, and runs the scanner against the fixtures through its own `action.yml`.

## Part of a set

Three Salesforce patterns generalized from production work and rebuilt from scratch with tests and CI, plus this CLI for the schema side:

- [sandbox-data-mask](https://github.com/s3rj/sandbox-data-mask): the data in your sandboxes
- [integration-log-retry](https://github.com/s3rj/integration-log-retry): outbound callouts that log, retry, and recover
- [hmac-webhook-receiver](https://github.com/s3rj/hmac-webhook-receiver): inbound webhooks that are verified, deduplicated, and reprocessable
- [flow-hardcoded-id-scanner](https://github.com/s3rj/flow-hardcoded-id-scanner): this project

More at [github.com/s3rj](https://github.com/s3rj).

## License

MIT
