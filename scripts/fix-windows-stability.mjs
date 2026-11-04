/**
 * Z-Bits — Windows Stability & Dev Environment Doctor
 *
 * Automates diagnostic and self-healing checks for Windows host environments:
 * 1. Checks and clears stale studio lock files (.openbot/openbot.lock).
 * 2. Scans for orphaned Node processes blocking dev ports (4310, 4311).
 * 3. Validates .env configuration for zero-config local SQLite operation.
 * 4. Ensures Bitrefill sandbox fallback is enabled for safe offline testing.
 * 5. Verifies local SQLite database readiness and seeded starter bots.
 */

import { existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

console.log("==========================================");
console.log("   Z-Bits Windows Stability Doctor");
console.log("==========================================\n");

const rootDir = process.cwd();
const dataDir = path.join(rootDir, ".openbot");
const lockPath = path.join(dataDir, "openbot.lock");
const envPath = path.join(rootDir, ".env");

// 1. Check and Clean Stale Lock File
console.log("[1/5] Checking studio lock status...");
if (existsSync(lockPath)) {
  try {
    const content = readFileSync(lockPath, "utf8").trim();
    const [pidStr, portStr] = content.split(" ");
    const pid = Number(pidStr);

    let isAlive = false;
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        isAlive = true;
      } catch {
        isAlive = false;
      }
    }

    if (!isAlive) {
      console.log(`  -> Found stale lock from dead PID ${pidStr}. Removing lockfile...`);
      unlinkSync(lockPath);
      console.log("  -> Stale lockfile successfully removed.");
    } else {
      console.log(`  -> Active server is running on PID ${pid} (serving port ${portStr || 4311}).`);
    }
  } catch (err) {
    console.warn("  -> Error inspecting lockfile:", err.message);
  }
} else {
  console.log("  -> No existing lockfile found. Clean.");
}

// 2. Scan and Report Dev Ports (4310, 4311)
console.log("\n[2/5] Inspecting ports 4310 (Vite) and 4311 (Express API)...");
if (process.platform === "win32") {
  try {
    const netstatOutput = execSync('netstat -ano | findstr ":4310 :4311"', { encoding: "utf8" });
    const lines = netstatOutput.trim().split("\n");
    console.log(`  -> Found ${lines.length} active connection/listener entry(s):`);
    for (const line of lines.slice(0, 5)) {
      console.log(`     ${line.trim()}`);
    }
    if (lines.length > 5) {
      console.log(`     ... and ${lines.length - 5} more.`);
    }
  } catch {
    console.log("  -> Ports 4310 and 4311 are completely free.");
  }
} else {
  console.log("  -> Non-Windows platform. Skipping netstat findstr.");
}

// 3. Inspect .env for Safe Local Mode Defaults
console.log("\n[3/5] Validating .env configuration...");
if (existsSync(envPath)) {
  let envText = readFileSync(envPath, "utf8");
  let modified = false;

  // Ensure placeholder DATABASE_URL is emptied so SQLite mode activates cleanly
  if (envText.includes("DATABASE_URL=YOUR_LOCAL_DATABASE_URL")) {
    console.log("  -> Detected placeholder DATABASE_URL. Normalizing to empty string for local SQLite mode...");
    envText = envText.replace("DATABASE_URL=YOUR_LOCAL_DATABASE_URL", "DATABASE_URL=");
    modified = true;
  }

  // Ensure BITREFILL_SANDBOX=true if no secret key is present
  if (!envText.includes("BITREFILL_SANDBOX=")) {
    console.log("  -> Appending BITREFILL_SANDBOX=true for local sandbox catalog testing...");
    envText += "\nBITREFILL_SANDBOX=true\n";
    modified = true;
  }

  if (modified) {
    writeFileSync(envPath, envText, "utf8");
    console.log("  -> .env updated with safe local defaults.");
  } else {
    console.log("  -> .env is properly configured for local operation.");
  }
} else {
  console.warn("  -> .env file not found. Copy .env.example to .env to configure settings.");
}

// 4. Verify SQLite Database State
console.log("\n[4/5] Checking local SQLite database readiness...");
const dbPath = path.join(dataDir, "openbot.sqlite");
if (existsSync(dbPath)) {
  console.log(`  -> SQLite database found at: ${dbPath}`);
} else {
  console.log("  -> Database will be automatically initialized and seeded on first server boot.");
}

// 5. Summary & Instructions
console.log("\n[5/5] Stability check complete!");
console.log("\nTo start Z-Bits dev server:");
console.log("  npm run dev");
console.log("\nWeb Studio UI will be accessible at: http://127.0.0.1:4310/");
console.log("Express API Gateway will be accessible at: http://127.0.0.1:4311/\n");
