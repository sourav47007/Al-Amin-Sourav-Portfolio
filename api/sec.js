// api/sec.js — Vercel serverless function: EDGAR proxy for What's Priced In?
//
//   GET /api/sec?ticker=AAPL   → compact financials JSON (see extract.js)
//
// Why a function: data.sec.gov has no CORS headers and SEC asks every client
// to identify itself with a descriptive User-Agent. The function also trims
// the multi-megabyte companyfacts file down to a few KB, which keeps it under
// Vercel's 4.5 MB response limit and makes the page fast.
//
// Caching: responses carry `s-maxage=86400`, so Vercel's CDN serves repeats
// for 24 hours without touching SEC. The ticker map is also cached in the
// function instance while it is warm.
//
// Rate limits: SEC allows 10 requests/second. One page load makes at most two
// sequential SEC requests (ticker map, then facts); the ticker map is cached.
// Set SEC_CONTACT_EMAIL in Vercel → Project → Settings → Environment Variables.

import { extractFinancials } from "../assets/js/valuation/extract.js";

const UA = `Sourav Portfolio ${process.env.SEC_CONTACT_EMAIL || "contact@example.com"}`;
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const FACTS_URL = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`;

let tickerCache = { at: 0, map: null };

async function secFetch(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate", "Accept": "application/json" } });
  if (res.status === 429 || res.status === 403) throw Object.assign(new Error("SEC rate limit reached. Try again in a minute."), { status: 429 });
  if (!res.ok) throw Object.assign(new Error(`SEC returned ${res.status}`), { status: res.status });
  return res.json();
}

export async function resolveTicker(ticker) {
  if (!tickerCache.map || Date.now() - tickerCache.at > 86400000) {
    const raw = await secFetch(TICKERS_URL);
    const map = new Map();
    for (const row of Object.values(raw)) map.set(String(row.ticker).toUpperCase(), { cik: row.cik_str, name: row.title });
    tickerCache = { at: Date.now(), map };
  }
  return tickerCache.map.get(ticker.toUpperCase()) || null;
}

export async function fetchFinancials(ticker) {
  const hit = await resolveTicker(ticker);
  if (!hit) throw Object.assign(new Error(`Ticker ${ticker.toUpperCase()} not found in SEC's company list.`), { status: 404 });
  const facts = await secFetch(FACTS_URL(hit.cik));
  return extractFinancials(facts, { ticker });
}

export default async function handler(req, res) {
  const ticker = String((req.query && req.query.ticker) || "").trim().toUpperCase();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "Pass a ticker, e.g. /api/sec?ticker=AAPL" });
  }
  try {
    const data = await fetchFinancials(ticker);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.message });
  }
}
