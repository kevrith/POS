#!/usr/bin/env node
/**
 * Realign Business.planName with Business.subscriptionTier.
 *
 * planName is a display label. It used to be written independently of the tier by
 * whichever caller happened to remember, so it drifted — one account reached
 * production on tier ENTERPRISE labelled "Free", which locked the customer out of
 * the UI they had paid for and applied the free-tier transaction cap to them.
 *
 * The write paths now derive the label from the tier, so this is a one-off for
 * rows created before that. It is safe to re-run.
 *
 * Deliberately conservative:
 *   - It only ever writes planName. It never touches subscriptionTier, status,
 *     trial dates or the comped flag.
 *   - A row whose subscriptionTier is not a real tier (e.g. "TRIAL", which is a
 *     status) is REPORTED, not corrected. Guessing what someone meant to sell a
 *     customer is not a script's decision.
 *
 * Usage:
 *   node scripts/backfill-plan-names.mjs           # dry run (default)
 *   node scripts/backfill-plan-names.mjs --apply   # write
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'apps', 'api');
const require = createRequire(join(API, 'package.json'));

require('dotenv').config({ path: join(API, '.env') });
const { PrismaClient } = require('@prisma/client');
const { planDisplayName, normalizeTier, SubscriptionTier } = require('@pos/shared');

const APPLY = process.argv.includes('--apply');
const VALID = new Set(Object.values(SubscriptionTier));

const prisma = new PrismaClient();

try {
  const rows = await prisma.business.findMany({
    select: { id: true, name: true, planName: true, subscriptionTier: true, subscriptionStatus: true },
    orderBy: { name: 'asc' },
  });

  const suspectTier = [];
  const toFix = [];

  for (const b of rows) {
    const raw = b.subscriptionTier;
    // normalizeTier silently maps anything unknown to FREE, which is right for
    // access control but would quietly relabel a bad row here. Check the raw value.
    if (!raw || !VALID.has(String(raw).trim().toUpperCase())) {
      // Report and skip. Relabelling this row would stamp a confident "Free" onto
      // an account whose real tier nobody has established yet, making the bad data
      // harder to spot rather than easier.
      suspectTier.push(b);
      continue;
    }

    const expected = planDisplayName(raw);
    if (b.planName !== expected) toFix.push({ ...b, expected });
  }

  console.log(`Businesses            : ${rows.length}`);
  console.log(`Labels out of step    : ${toFix.length}`);
  console.log(`Invalid tier values   : ${suspectTier.length}`);
  console.log();

  if (toFix.length) {
    console.log(APPLY ? 'Updating:' : 'Would update (dry run):');
    for (const b of toFix) {
      console.log(
        `  ${String(b.name).padEnd(22)} tier=${String(b.subscriptionTier).padEnd(11)}` +
        ` ${JSON.stringify(b.planName)} -> ${JSON.stringify(b.expected)}`,
      );
    }
    console.log();
  }

  if (suspectTier.length) {
    console.log('NOT corrected — subscriptionTier is not a valid tier. Decide these by hand:');
    for (const b of suspectTier) {
      console.log(
        `  ${String(b.name).padEnd(22)} subscriptionTier=${JSON.stringify(b.subscriptionTier)}` +
        ` subscriptionStatus=${JSON.stringify(b.subscriptionStatus)}` +
        `  (treated as ${normalizeTier(b.subscriptionTier)} everywhere today)`,
      );
    }
    console.log();
  }

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to write.');
  } else if (toFix.length) {
    let n = 0;
    for (const b of toFix) {
      await prisma.business.update({ where: { id: b.id }, data: { planName: b.expected } });
      n++;
    }
    console.log(`Updated ${n} business ${n === 1 ? 'label' : 'labels'}.`);
  } else {
    console.log('Nothing to do.');
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
