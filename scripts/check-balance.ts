import fs from "fs";

async function main() {
  const envContent = fs.readFileSync(".env", "utf8");
  const match = envContent.match(/BITREFILL_API_KEY=(.*)/);
  const apiKey = match ? match[1].trim().replace(/^['"]|['"]$/g, "") : "";

  const resp = await fetch("https://api.bitrefill.com/v2/products?query=steam&country=US", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "Z-Bits-Runner/1.0.0",
    },
  });

  const body = await resp.json();
  const products = body.data || body;
  console.log("Total products returned:", products.length);
  if (products.length > 0) {
    const first = products[0];
    console.log("Sample product:", {
      id: first.id,
      name: first.name,
      country: first.country,
      currency: first.currency,
      packages: first.packages?.slice(0, 3),
      range: first.range,
    });
  }
}

main().catch(console.error);
