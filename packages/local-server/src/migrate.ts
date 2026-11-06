import { run } from './postgres';
import { databaseUrl, ServerConfig } from './config';

export interface MigrateOptions {
  /** Path to Node (the bundled node.exe in the installer). */
  nodePath: string;
  /** Prisma's CLI entry point, node_modules/prisma/build/index.js. */
  prismaCli: string;
  /** prisma/schema.prisma, with its migrations folder beside it. */
  schemaPath: string;
}

/**
 * Bring the database up to this version of the app. Safe to run on every start: it applies only what is missing.
 * The first run also creates the (empty) `kastra` database, which Prisma does when it is absent.
 */
export async function migrate(cfg: ServerConfig, o: MigrateOptions): Promise<string> {
  const url = databaseUrl(cfg);
  const r = await run(o.nodePath, [o.prismaCli, 'migrate', 'deploy', '--schema', o.schemaPath], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    timeoutMs: 10 * 60 * 1000,
  });
  if (r.code !== 0) {
    throw new Error(`Updating the database failed. ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-6).join(' | ')}`);
  }
  return r.stdout;
}
