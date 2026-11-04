import { type Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppliedMigration {
  version: string;
  name: string;
  appliedAt: string;
  checksum: string;
}

export class MigrationRunner {
  private readonly migrationsDir: string;

  constructor(migrationsDir?: string) {
    this.migrationsDir = migrationsDir || path.join(__dirname, "migrations");
  }

  /**
   * Initializes the schema_migrations tracking table if it does not exist.
   */
  public async ensureMigrationsTable(pool: Pool): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL
      );
    `);
  }

  /**
   * Returns a list of all migrations that have been applied.
   */
  public async getAppliedMigrations(pool: Pool): Promise<AppliedMigration[]> {
    await this.ensureMigrationsTable(pool);
    const result = await pool.query(`
      SELECT version, name, checksum, applied_at
      FROM schema_migrations
      ORDER BY version ASC
    `);

    return result.rows.map((r) => ({
      version: String(r.version),
      name: String(r.name),
      checksum: String(r.checksum),
      appliedAt: new Date(r.applied_at).toISOString(),
    }));
  }

  /**
   * Discovers and applies all pending migrations in deterministic numerical order.
   */
  public async runMigrations(pool: Pool): Promise<{
    applied: string[];
    skipped: string[];
    total: number;
  }> {
    await this.ensureMigrationsTable(pool);
    const appliedRecords = await this.getAppliedMigrations(pool);
    const appliedVersions = new Set(appliedRecords.map((m) => m.version));

    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const newlyApplied: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const version = match[1]!;
      const name = match[2]!;
      const filePath = path.join(this.migrationsDir, file);
      const sql = readFileSync(filePath, "utf-8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      if (appliedVersions.has(version)) {
        skipped.push(file);
        continue;
      }

      // Execute migration within an atomic transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)",
          [version, name, checksum]
        );
        await client.query("COMMIT");
        newlyApplied.push(file);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(
          `Migration failed for ${file}: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        client.release();
      }
    }

    return {
      applied: newlyApplied,
      skipped,
      total: files.length,
    };
  }
}
