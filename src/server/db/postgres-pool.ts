import { Pool, type PoolConfig, type PoolClient } from "pg";

export interface DatabaseHealthStatus {
  healthy: boolean;
  engine: "postgresql" | "sqlite";
  latencyMs?: number;
  totalConnections?: number;
  idleConnections?: number;
  waitingCount?: number;
  error?: string;
}

export class PostgresPoolManager {
  private pool: Pool | null = null;
  private readonly connectionString: string | null;
  private isConnecting = false;

  constructor(connectionString?: string) {
    this.connectionString = connectionString || process.env.DATABASE_URL || null;
  }

  /**
   * Initializes or returns the existing PostgreSQL connection pool.
   */
  public getPool(): Pool {
    if (this.pool) return this.pool;

    if (!this.connectionString) {
      throw new Error(
        "PostgreSQL connection failed: No DATABASE_URL provided. Configure DATABASE_URL in environment or Render Blueprint."
      );
    }

    const maxConnections = Number(process.env.DATABASE_MAX_CONNECTIONS || 20);
    const idleTimeoutMillis = Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000);
    const connectionTimeoutMillis = Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 5000);

    // Render Managed PostgreSQL and cloud databases typically require SSL
    const isRemote = this.connectionString.includes("render.com") ||
      this.connectionString.includes("aws") ||
      this.connectionString.includes("sslmode=require") ||
      process.env.DATABASE_SSL === "true";

    const poolConfig: PoolConfig = {
      connectionString: this.connectionString,
      max: maxConnections,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
    };

    this.pool = new Pool(poolConfig);

    this.pool.on("error", (err) => {
      console.error("[PostgresPool] Unexpected client error on idle PostgreSQL client:", err);
    });

    return this.pool;
  }

  /**
   * Performs an active readiness / health check on the database.
   */
  public async checkHealth(): Promise<DatabaseHealthStatus> {
    if (!this.connectionString && !this.pool) {
      return {
        healthy: false,
        engine: "postgresql",
        error: "DATABASE_URL not configured",
      };
    }

    const start = Date.now();
    try {
      const pool = this.getPool();
      const res = await pool.query("SELECT 1 AS ok, current_database() AS db_name, version() AS ver");
      const latencyMs = Date.now() - start;

      if (res.rows && res.rows[0]?.ok === 1) {
        return {
          healthy: true,
          engine: "postgresql",
          latencyMs,
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingCount: pool.waitingCount,
        };
      }
      return {
        healthy: false,
        engine: "postgresql",
        latencyMs,
        error: "Unexpected health check query result",
      };
    } catch (e) {
      return {
        healthy: false,
        engine: "postgresql",
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Executes a callback within a managed client transaction.
   */
  public async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Gracefully shuts down the connection pool.
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

