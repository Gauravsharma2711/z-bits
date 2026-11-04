import fs from "fs";
import { BitrefillClient } from "../src/server/runner/bitrefill-client.js";

async function main() {
  const envContent = fs.readFileSync(".env", "utf8");
  const lines = envContent.split("\n");
  let apiKey = "";
  let apiSecret = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("BITREFILL_API_KEY=")) {
      apiKey = trimmed.slice("BITREFILL_API_KEY=".length).replace(/^['"]|['"]$/g, "").trim();
    }
    if (trimmed.startsWith("BITREFILL_API_SECRET=")) {
      apiSecret = trimmed.slice("BITREFILL_API_SECRET=".length).replace(/^['"]|['"]$/g, "").trim();
    }
  }

  console.log({
    hasKey: Boolean(apiKey),
    keyLength: apiKey.length,
    hasColonInKey: apiKey.includes(":"),
    hasSecret: Boolean(apiSecret),
    secretLength: apiSecret.length,
  });

  // Test Bitrefill API endpoint ping with provided key
  // We test both Bearer and Basic headers to check which one Bitrefill accepts for accounts/catalog
  const endpoints = [
    "https://api.bitrefill.com/v2/products?query=steam&country=US",
    "https://api.bitrefill.com/v2/accounts/balance",
  ];

  for (const url of endpoints) {
    console.log(`\nTesting endpoint: ${url}`);

    // Try Basic if key:secret or key:
    const basicCreds = apiKey.includes(":") 
      ? Buffer.from(apiKey).toString("base64")
      : apiSecret 
        ? Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")
        : Buffer.from(`${apiKey}:`).toString("base64");

    try {
      const respBasic = await fetch(url, {
        headers: {
          Authorization: `Basic ${basicCreds}`,
          Accept: "application/json",
          "User-Agent": "Z-Bits-Runner/1.0.0",
        },
      });
      console.log(`Basic Auth Status: ${respBasic.status} ${respBasic.statusText}`);
      if (respBasic.ok) {
        const data = await respBasic.json();
        console.log("Basic Auth Response preview:", Array.isArray(data) ? `Array length ${data.length}` : Object.keys(data));
      } else {
        const txt = await respBasic.text();
        console.log("Basic Auth Error message:", txt.slice(0, 200));
      }
    } catch (e: any) {
      console.log("Basic Auth network error:", e.message);
    }

    // Try Bearer
    try {
      const respBearer = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "User-Agent": "Z-Bits-Runner/1.0.0",
        },
      });
      console.log(`Bearer Auth Status: ${respBearer.status} ${respBearer.statusText}`);
      if (respBearer.ok) {
        const data = await respBearer.json();
        console.log("Bearer Auth Response preview:", Array.isArray(data) ? `Array length ${data.length}` : Object.keys(data));
      } else {
        const txt = await respBearer.text();
        console.log("Bearer Auth Error message:", txt.slice(0, 200));
      }
    } catch (e: any) {
      console.log("Bearer Auth network error:", e.message);
    }
  }
}

main().catch(console.error);
