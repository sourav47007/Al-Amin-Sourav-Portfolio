// Builds the offline preset snapshots in data/presets/ from SEC EDGAR.
// Run on your own machine (it needs internet access):
//
//   SEC_CONTACT_EMAIL=you@example.com npm run presets
//
// It writes one JSON per ticker plus index.json. Re-run whenever you want
// fresher snapshots (after 10-K season is a good time).
import { writeFileSync, mkdirSync } from "node:fs";
import { fetchFinancials } from "../api/sec.js";

const TICKERS = (process.argv[2] || "AAPL,MSFT,NVDA,KO,TSLA,WMT").split(",");
mkdirSync("data/presets", { recursive: true });
const index = [];
for (const t of TICKERS) {
  try {
    const fin = await fetchFinancials(t);
    writeFileSync(`data/presets/${t}.json`, JSON.stringify(fin));
    index.push({ ticker: t, name: fin.name, fetchedAt: fin.fetchedAt, latest: fin.years[fin.years.length - 1].end });
    console.log(`✓ ${t} ${fin.name} (${fin.years.length} years, ${fin.quality.length} notes)`);
  } catch (e) {
    console.error(`✗ ${t}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 300)); // stay well under SEC's 10 req/s
}
writeFileSync("data/presets/index.json", JSON.stringify(index, null, 2));
console.log(`wrote data/presets/index.json with ${index.length} companies`);
