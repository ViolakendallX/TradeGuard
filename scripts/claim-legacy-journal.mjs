#!/usr/bin/env node
/**
 * Claim pre-account journal records for one account.
 *
 * WHY THIS IS A SCRIPT AND NOT A ROUTE
 * A record written before accounts existed has no owner, and the server must
 * never guess one. Attributing it is an operator act on the file itself — not
 * something a signed-in trader can trigger, and not something that happens
 * automatically on first sign-in. Keeping it here means the only way to hand
 * those records over is to run a command on the machine that holds them.
 *
 * WHAT IT WILL NOT DO
 *   - It will not touch a record that already has an owner. Attribution is
 *     additive; it can never reassign someone's trade to someone else.
 *   - It will not delete anything.
 *   - It will not run without `--confirm`. The default is a dry run, so the
 *     first thing an operator sees is what WOULD change.
 *   - It will not write a partial result: the whole file is rewritten in one
 *     atomic rename, or not at all.
 *
 * USAGE
 *   node scripts/claim-legacy-journal.mjs --list
 *       Report what is unattributed. Reads only.
 *
 *   node scripts/claim-legacy-journal.mjs --account <email>
 *       Dry run: show exactly which records would be attributed to that account.
 *
 *   node scripts/claim-legacy-journal.mjs --account <email> --confirm
 *       Apply it. A timestamped backup of the journal is written first.
 *
 * The account must already exist. The id is looked up from the accounts file, so
 * the operator names an email and never has to know an internal id.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  auditJournal,
  DEFAULT_JOURNAL_FILE,
  JOURNAL_FILE_ENV,
  normalizeUserId,
} from '../server/services/tradeJournal.js';
import {
  createUserStore,
  normalizeEmail,
  DEFAULT_USERS_FILE,
  USERS_FILE_ENV,
} from '../server/services/userStore.js';

function journalFilePath() {
  return process.env[JOURNAL_FILE_ENV] || DEFAULT_JOURNAL_FILE;
}

function usersFilePath() {
  return process.env[USERS_FILE_ENV] || DEFAULT_USERS_FILE;
}

function usage(problem) {
  if (problem) console.error(`\n  ${problem}\n`);
  console.log(`
  Claim pre-account Trade Memory records for one account.

    --list                 report what is unattributed (reads only)
    --account <email>      dry run for that account
    --confirm              apply the change (requires --account)

  Journal: ${journalFilePath()}
  Accounts: ${usersFilePath()}
`);
  process.exit(problem ? 1 : 0);
}

function parseArgs(argv) {
  const args = { list: false, confirm: false, account: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') args.list = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--account') {
      args.account = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--help' || arg === '-h') usage();
    else usage(`Unknown argument: ${arg}`);
  }
  return args;
}

/** Reads the raw journal, tolerating an absent file. */
function readJournal(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return { ok: true, exists: false, payload: { version: 2, records: [] } };
    return { ok: false, problem: `The journal could not be read: ${e?.message || e}` };
  }

  try {
    const payload = JSON.parse(text);
    const records = Array.isArray(payload) ? payload : payload?.records;
    if (!Array.isArray(records)) return { ok: false, problem: 'The journal does not contain a records list.' };
    return { ok: true, exists: true, payload: Array.isArray(payload) ? { version: 2, records } : payload };
  } catch {
    return { ok: false, problem: 'The journal is not valid JSON.' };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.list && !args.account) usage('Pass --list, or --account <email> to attribute records.');

  const file = journalFilePath();
  const audit = auditJournal({ filePath: file });

  if (!audit.ok) {
    console.error(`\n  The journal could not be audited: ${audit.problem}\n`);
    process.exit(1);
  }

  // --- read-only report ------------------------------------------------------
  if (args.list) {
    console.log(`
  Journal: ${file}
  Total records:        ${audit.total}
  Attributed:           ${audit.attributed}  (belong to ${audit.owners} account${audit.owners === 1 ? '' : 's'})
  Unattributed:         ${audit.unattributed}  (written before accounts existed)
`);
    if (audit.unattributed === 0) console.log('  Nothing to claim.\n');
    else console.log(`  Run with --account <email> to see what would be attributed.\n`);
    return;
  }

  // --- resolve the account ---------------------------------------------------
  const users = createUserStore({ filePath: usersFilePath() });
  const found = users.findByEmail(args.account);

  if (!found.ok) {
    console.error(`\n  The accounts file could not be read: ${found.problem}\n`);
    process.exit(1);
  }
  if (!found.user) {
    console.error(`\n  No account exists for ${normalizeEmail(args.account)}. Create it first.\n`);
    process.exit(1);
  }

  const ownerId = normalizeUserId(found.user.id);
  if (!ownerId) {
    console.error('\n  That account has no usable id, so nothing can be attributed to it.\n');
    process.exit(1);
  }

  // --- select what would change ---------------------------------------------
  const loaded = readJournal(file);
  if (!loaded.ok) {
    console.error(`\n  ${loaded.problem}\n`);
    process.exit(1);
  }

  const records = loaded.payload.records;
  const candidates = records.filter((r) => !normalizeUserId(r?.userId));

  console.log(`
  Journal: ${file}
  Account: ${found.user.email}  (${ownerId})
  Unattributed records: ${candidates.length}
`);

  if (candidates.length === 0) {
    console.log('  Nothing to claim — every record already has an owner.\n');
    return;
  }

  for (const record of candidates) {
    const asset = record?.trade?.asset ?? '(no asset recorded)';
    const when = record?.createdAt ?? '(no date recorded)';
    console.log(`    - ${record?.id ?? '(no id)'}  ${asset}  ${when}`);
  }

  // --- dry run ---------------------------------------------------------------
  if (!args.confirm) {
    console.log(`
  DRY RUN — nothing was written.

  Re-run with --confirm to attribute these ${candidates.length} record${candidates.length === 1 ? '' : 's'}
  to ${found.user.email}. A timestamped backup will be written first.
`);
    return;
  }

  // --- apply -----------------------------------------------------------------
  const backup = `${file}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    fs.copyFileSync(file, backup);
  } catch (e) {
    console.error(`\n  Could not write a backup, so nothing was changed: ${e?.message || e}\n`);
    process.exit(1);
  }

  const updated = records.map((r) =>
    normalizeUserId(r?.userId) ? r : { ...r, userId: ownerId }
  );

  const payload = { ...loaded.payload, records: updated, updatedAt: new Date().toISOString() };
  const tmp = `${file}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best-effort cleanup */
    }
    console.error(`\n  The journal could not be written: ${e?.message || e}\n  Backup: ${backup}\n`);
    process.exit(1);
  }

  const after = auditJournal({ filePath: file });
  console.log(`
  Done.
    Attributed now: ${after.attributed}
    Unattributed:   ${after.unattributed}
    Backup:         ${backup}

  ${found.user.email} will now see these records in Trade Memory. Nobody else will.
`);
}

main();
