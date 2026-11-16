# Preset snapshots

`[DATA NEEDED]` — this folder is empty until you run, on a machine with internet access:

    SEC_CONTACT_EMAIL=you@example.com npm run presets

That fetches Apple, Microsoft, Nvidia, Coca-Cola, Tesla and Walmart from SEC
EDGAR, trims each to the fields the DCF needs, and writes `AAPL.json` etc.
plus `index.json`. Commit the result. The page lists whatever `index.json`
contains, so you can add or remove tickers:

    npm run presets -- AAPL,MSFT,JNJ

No numbers are invented here: the snapshots are SEC filings, and the page
shows the "fetched on" date for each.
