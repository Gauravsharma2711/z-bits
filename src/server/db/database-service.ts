import { Pool } from "pg";
import { PostgresPoolManager, type DatabaseHealthStatus } from "./postgres-pool.js";
import { MigrationRunner } from "./migration-runner.js";
import { PostgresZbitsRepository } from "./postgres-zbits-repository.js";

export interface DatabaseServiceConfig {
  databaseUrl?: string;
  autoMigrate?: boolean;
}

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private poolManager: PostgresPoolManager | null = null;
  private repository: PostgresZbitsRepository | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initializes the PostgreSQL database connection and runs pending migrations.
   */
  public async initialize(config?: DatabaseServiceConfig): Promise<boolean> {
    const dbUrl = config?.databaseUrl || process.env.DATABASE_URL;

    if (!dbUrl) {
      console.log("[DatabaseService] No DATABASE_URL configured. Operating in SQLite/local-only mode.");
      return false;
    }

    try {
      console.log("[DatabaseService] Initializing PostgreSQL connection pool...");
      this.poolManager = new PostgresPoolManager(dbUrl);
      const pool = this.poolManager.getPool();

      // Check health & connectivity
      const health = await this.poolManager.checkHealth();
      if (!health.healthy) {
        throw new Error(`PostgreSQL health check failed: ${health.error}`);
      }
      console.log(`[DatabaseService] Connected to PostgreSQL in ${health.latencyMs}ms.`);

      // Run migrations
      if (config?.autoMigrate !== false) {
        const migrationRunner = new MigrationRunner();
        console.log("[DatabaseService] Checking and running schema migrations...");
        const result = await migrationRunner.runMigrations(pool);
        console.log(
          `[DatabaseService] Migrations: ${result.applied.length} applied, ${result.skipped.length} up-to-date.`
        );
      }

      this.repository = new PostgresZbitsRepository(pool);
      // Ensure default owner exists
      await this.repository.ensureOwner();
      // Ensure spending constitution exists
      await this.repository.getSpendingConstitution();

      this.isInitialized = true;
      console.log("[DatabaseService] PostgreSQL database layer is fully initialized and operational.");
      return true;
    } catch (err) {
      console.error("[DatabaseService] Failed to initialize PostgreSQL database:", err);
      // Fail closed
      throw err;
    }
  }

  public isPostgresActive(): boolean {
    return this.isInitialized && this.repository !== null;
  }

  public getRepository(): PostgresZbitsRepository {
    if (!this.repository) {
      throw new Error(
        "DatabaseService error: PostgreSQL repository is not initialized. Ensure DATABASE_URL is set and initialize() has succeeded."
      );
    }
    return this.repository;
  }

  public getPool(): Pool {
    if (!this.poolManager) {
      throw new Error("DatabaseService error: Connection pool is not initialized.");
    }
    return this.poolManager.getPool();
  }

  public async checkHealth(): Promise<DatabaseHealthStatus> {
    if (!this.poolManager) {
      return {
        healthy: false,
        engine: "postgresql",
        error: "PostgreSQL pool not initialized",
      };
    }
    return this.poolManager.checkHealth();
  }

  public async close(): Promise<void> {
    if (this.poolManager) {
      await this.poolManager.close();
      this.poolManager = null;
      this.repository = null;
      this.isInitialized = false;
    }
  }
}

