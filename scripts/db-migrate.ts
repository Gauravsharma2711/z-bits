import { PostgresPoolManager } from "../src/server/db/postgres-pool.js";
import { MigrationRunner } from "../src/server/db/migration-runner.js";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Error: DATABASE_URL environment variable is required to run migrations.");
    process.exit(1);
  }

  const action = process.argv[2] || "migrate";
  const poolManager = new PostgresPoolManager(dbUrl);
  const pool = poolManager.getPool();

  try {
    const health = await poolManager.checkHealth();
    if (!health.healthy) {
      console.error(`Database connection check failed: ${health.error}`);
      process.exit(1);
    }
    console.log(`Connected to PostgreSQL (${health.latencyMs}ms latency).`);

    const runner = new MigrationRunner();

    if (action === "status") {
      const applied = await runner.getAppliedMigrations(pool);
      console.log(`\nApplied Migrations (${applied.length}):`);
      for (const m of applied) {
        console.log(`  - [${m.version}] ${m.name} (applied: ${m.appliedAt})`);
      }
    } else if (action === "migrate") {
      console.log("\nRunning pending migrations...");
      const result = await runner.runMigrations(pool);
      console.log(`\nMigration completed:`);
      console.log(`  Newly applied: ${result.applied.length > 0 ? result.applied.join(", ") : "None (up to date)"}`);
      console.log(`  Skipped: ${result.skipped.length}`);
      console.log(`  Total files: ${result.total}`);
    } else if (action === "reset") {
      if (process.env.NODE_ENV === "production") {
        console.error("FATAL: db:reset cannot be executed in production environment!");
        process.exit(1);
      }
      console.warn("\n⚠️  DEVELOPMENT RESET: Dropping all Z-Bits tables...");
      await pool.query(`
        DROP TABLE IF EXISTS audit_logs CASCADE;
        DROP TABLE IF EXISTS zcash_transactions CASCADE;
        DROP TABLE IF EXISTS bounty_events CASCADE;
        DROP TABLE IF EXISTS runner_invoices CASCADE;
        DROP TABLE IF EXISTS runner_executions CASCADE;
        DROP TABLE IF EXISTS spendpass_tokens CASCADE;
        DROP TABLE IF EXISTS gate_decisions CASCADE;
        DROP TABLE IF EXISTS gate_approvals CASCADE;
        DROP TABLE IF EXISTS spending_ledger CASCADE;
        DROP TABLE IF EXISTS purchase_intents CASCADE;
        DROP TABLE IF EXISTS recipient_aliases CASCADE;
        DROP TABLE IF EXISTS recipients CASCADE;
        DROP TABLE IF EXISTS spending_constitution CASCADE;
        DROP TABLE IF EXISTS zbits_owners CASCADE;
        DROP TABLE IF EXISTS schema_migrations CASCADE;
      `);
      console.log("All tables dropped. Re-running migrations...");
      const result = await runner.runMigrations(pool);
      console.log(`Reset complete. Applied ${result.applied.length} migrations.`);
    } else {
      console.error(`Unknown action: ${action}. Use 'migrate', 'status', or 'reset'.`);
      process.exit(1);
    }
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    await poolManager.close();
  }
}

main();

