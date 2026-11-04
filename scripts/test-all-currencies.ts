import fs from "fs";

async function main() {
  const envContent = fs.readFileSync(".env", "utf8");
  const match = envContent.match(/BITREFILL_API_KEY=(.*)/);
  const apiKey = match ? match[1].trim().replace(/^['"]|['"]$/g, "") : "";

  const currencies = ["USD", "EUR", "BTC", "USDT", "USDC", "ETH", "DOGE", "LTC"];

  for (const c of currencies) {
    const url = `https://api.bitrefill.com/v2/accounts/balance?currency=${c}`;
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "User-Agent": "Z-Bits-Runner/1.0.0",
        },
      });
      if (resp.ok) {
        const d = await resp.json();
        console.log(`Currency: ${c} ->`, d.data);
      } else {
        console.log(`Currency: ${c} -> HTTP ${resp.status}`);
      }
    } catch (e: any) {
      console.log(`Error on ${c}:`, e.message);
    }
  }
}

main().catch(console.error);
