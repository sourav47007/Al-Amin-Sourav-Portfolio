// =====================================================================
//  content/site.js  —  EVERYTHING PERSONAL ON THE SITE LIVES HERE.
//
//  Edit this file to change your name, role, intro, bio, experience,
//  links, the "Now" line, project blurbs and the ticker strip.
//  Plain text only (no HTML). Line breaks inside a paragraph are fine.
//
//  After editing, run  `npm run sync`  once so the <title> and social
//  preview (Open Graph) tags in every HTML page pick up the new name
//  and URL. Everything else updates on the next page load.
//
//  Rules you set for yourself: no phone number, home address or CGPA.
// =====================================================================

export const site = {
  // --- Identity --------------------------------------------------------
  name: "Md. Al-Amin Rahman Sourav",
  shortName: "Sourav",                 // used in the logo and ticker
  role: "Finance and Banking graduate · finance intern at Daraz Bangladesh",

  // Absolute URL of the deployed site, no trailing slash.
  // Used for Open Graph tags and share links. Change after you deploy.
  url: "https://al-amin-sourav-portfolio.vercel.app",

  // --- Home page -------------------------------------------------------
  // 2–3 lines. This is a draft written from your CV; rewrite it in your own words.
  intro:
    "I work on accounts, reconciliation and month-end reporting, and I like building small tools that make finance easier to understand. " +
    "This site holds four of them: a reverse DCF, a market-making game, a reconciliation engine that runs in your browser, and a decoder for credit offers.",

  // The "Now" line under the project tiles.
  now: "Finance Intern @ Daraz Bangladesh",

  // --- Links -----------------------------------------------------------
  email: "alaminrahman.sourav@gmail.com",
  linkedin: "https://www.linkedin.com/in/REPLACE-ME",
  github: "https://github.com/sourav47007",
  // The repository that holds this site (used by the "Source code" links).
  repo: "https://github.com/sourav47007/Al-Amin-Sourav-Portfolio",
  cvFile: "/files/CV_Md_Al-Amin_Rahman_Sourav.pdf",

  // --- About page ------------------------------------------------------
  // Draft written from your CV. Rewrite freely.
  bio: [
    "I graduated in 2026 with a BBA in Finance and Banking from Bangladesh University of Professionals. " +
    "I now work as a finance intern at Daraz Bangladesh, where I look after accounts receivable for logistics partners, vendor payments, monthly reconciliations and the month-end close under IFRS.",
    "Before that I spent a year with DHL Global Forwarding's integrated warehouse team, supporting Dell's warehouse operations and running inventory counts. " +
    "That is where I learned that most finance problems are matching problems: two lists that should agree and don't.",
    "Outside work I organise debates and run a volunteer project for children with disabilities."
  ],

  experience: [
    {
      role: "Finance Intern",
      org: "Daraz Bangladesh",
      from: "Sep 2026",
      to: "Present",
      points: [
        "Accounts receivable for 7+ third-party logistics partners",
        "Accounts payable and vendor payments across retail, 3PL and marketplace vendors",
        "Reconciliation of 150+ invoices a month; month-end close under IFRS/IAS",
        "Power BI dashboards on ageing and payment KPIs"
      ]
    },
    {
      role: "Intern, Integrated Warehouse Solutions",
      org: "DHL Global Forwarding",
      from: "Jul 2024",
      to: "Aug 2025",
      points: [
        "Supported Dell's warehouse operations across receiving, putaway, returns and dispatch",
        "Ran monthly, quarterly and annual inventory counts",
        "Posted receipts against purchase orders and RMA lots, escalating discrepancies within 48 hours"
      ]
    }
  ],

  education: [
    {
      degree: "BBA in Finance and Banking",
      org: "Bangladesh University of Professionals (BUP)",
      year: "2026"
    }
  ],

  skills: [
    "Financial modelling (DCF, three-statement)",
    "Investment appraisal (NPV, IRR)",
    "Excel (advanced)",
    "Power BI",
    "SAP basics",
    "Stata"
  ],

  competitions: [
    "Finalist, Casespecs 2.0 (The Infinity AI Buildfest)",
    "Semi-finalist, Nextor 2.0 (AdventHR 2024)"
  ],

  leadership: [
    { role: "Organizing Secretary", org: "BUP Debate Club", years: "2025 – 2026" },
    { role: "Project Manager", org: "Project Barnali, an initiative for children with disabilities", years: "2024 – 2026" }
  ],

  // --- Projects --------------------------------------------------------
  // Order here is the order of the tiles on the home page.
  // "why" is shown under each tool in the "Why I built it" section.
  projects: [
    {
      slug: "valuation",
      title: "What's Priced In?",
      line: "A reverse DCF for any US-listed company.",
      icon: "candlestick",
      why:
        "A DCF tells you what a company might be worth. Run backwards, it tells you what the market already believes. " +
        "I built this after doing a valuation by hand and realising the second question is the one that keeps you honest."
    },
    {
      slug: "market",
      title: "Make Me a Market",
      line: "A pixel-art market-making game.",
      icon: "die",
      why:
        "\"Make me a market\" is the question every trading interview asks. I wanted a version you could play for ten minutes and come away understanding spread, inventory and adverse selection."
    },
    {
      slug: "recon",
      title: "Recon",
      line: "Match two lists in your browser. Nothing is uploaded.",
      icon: "ledger",
      why:
        "I reconcile invoices against payments every month. The slow part is never the exact matches; it is the partial payments, the typos and the duplicates. " +
        "Recon handles those, and the files never leave your machine."
    },
    {
      slug: "truecost",
      title: "True Cost",
      line: "What a loan, EMI or Buy Now Pay Later offer really costs.",
      icon: "receipt",
      why:
        "\"0% EMI\" and \"flat 9%\" are not prices; they are marketing. Turning any offer into cash flows and an annual rate is the only fair way to compare them."
    }
  ],

  // --- Case study on the valuation page --------------------------------
  caseStudy: {
    title: "My LafargeHolcim Bangladesh valuation",
    file: "/files/LafargeHolcim_Valuation_Model.xlsx",   // put the file in /files
    // Draft; rewrite in your own words.
    text: [
      "In 2026 I built a DCF and relative valuation of LafargeHolcim Bangladesh PLC on integrated three-statement forecasts: income statement, balance sheet and cash flow linked so that every assumption flows through.",
      "The model derives an implied value per share and benchmarks it against the market price using peer multiples. The spreadsheet is available below."
    ]
  },

  // --- Notes page ------------------------------------------------------
  // Add entries as { date: "16 Nov 2026", title: "...", text: "..." }.
  notes: [],

  // --- Ticker strip ----------------------------------------------------
  // Short facts shown in the scrolling strip at the top. Not market data.
  ticker: [
    "WHAT'S PRICED IN? ▲ reverse DCF",
    "MAKE ME A MARKET ▲ pixel trading game",
    "RECON ▲ in-browser reconciliation",
    "TRUE COST ▲ credit offer decoder",
    "NO TRACKING · NO SIGN-UP",
    "BUILT WITH PLAIN HTML, CSS AND JS"
  ]
};
