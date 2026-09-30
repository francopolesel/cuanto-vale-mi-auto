<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/public/logo-dark.png">
  <img src="frontend/public/logo.png" alt="Cuánto vale mi auto" width="420">
</picture>

# Cuánto vale mi auto *(How much is my car worth)*

### How much is your car worth? Type brand, model, year — and find out.

Automatic valuation of used cars in Argentina, built on **real listings**,
robust statistics and a **weighted-comparables engine**. No external AI, no paid APIs, no magic.

[**🇪🇸 Leer en español**](README.md) · [**🚀 Live demo**](#-demo) · [**✨ Features**](#-features) · [**🧠 How it works**](#-how-it-works-under-the-hood)

![Tests](https://img.shields.io/badge/tests-27%2F27-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Stack](https://img.shields.io/badge/React%20%2B%20Node%20%2B%20TS-informational)
![Cost](https://img.shields.io/badge/cost-%240-success)

</div>

---

## 🎯 The problem

Pricing a used car in Argentina is chaos: ARS and USD listings side by side,
down payments disguised as prices, trim names that change per site, and a market
that moves every week. Printed guides go stale and appraisers charge.

**Cuánto vale mi auto** answers a single question, with today's data:

> **Volkswagen Gol Trend 2017 → $14,000,000 — $17,460,000 ARS**

---

## ✨ Features

- 🔍 **Real multi-source scraping** — Mercado Libre, Autocosmos, Kavak, DeMotores (independent adapters; if one source fails, the rest carry on).
- ⚖️ **Comparable-based valuation** — every listing gets a similarity weight (model × year × trim × mileage). No naive averages.
- 📈 **Progressive search** — when exact matches are scarce, it expands to nearby years, re-searches year-less, and relaxes optional filters before giving up.
- 💱 **ARS + USD** — live official-rate conversion (free DolarAPI), always disclosed.
- 🚗 **New & used** — 0 km search with boosted comparables; optional mileage/trim filters that weight, never exclude.
- 📊 **Honest statistics** — weighted median/mean/P10–P90, IQR/MAD outliers, Theil-Sen time adjustment, explainable confidence.
- ♿ **Genuinely accessible** — high contrast, large type, ≥48px targets, keyboard navigation, light/dark mode, plain-language Spanish UI.

---

## 🚀 Demo

👉 **Coming soon on Render** (auto-deploy from `main` via the included `render.yaml`).

Or run it locally in 2 commands:

```bash
npm install
npm run dev
```

Open 👉 http://localhost:5173 → try `Volkswagen Gol Trend 2017`.

---

## 🧠 How it works (under the hood)

```
User: brand + model + year (+ optional filters)
  ↓
LEVEL 1 · Exact search across all sources
  ↓ Enough comparables?
  NO ↓
LEVEL 2-3 · Broad re-search (year-less model query, extra pages)
  ↓
LEVEL 4-5 · Similarity scoring + time/km adjustment + outliers + weighted stats
  ↓
LEVEL 6 · Optional-filter relaxation (disclosed, never silent)
  ↓
Estimate + confidence + transparent methodology (debug object in the API)
```

**Golden rule**: missing identical listings does **not** mean it can't be estimated.
"Insufficient data" only happens when nothing comparable exists at all.

---

## 🛠️ Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · TypeScript · Vite · token-based CSS (light/dark) |
| Backend | Node.js · Express · strict TypeScript · Zod |
| Data | HTTP + JSON-LD scraping (no browser) · in-memory cache with TTL |
| Quality | 27 tests (unit + real HTML fixtures) · verified builds · CI (prettier + tsc + vitest) |

**Fully free**: zero paid APIs, zero proxies, zero LLMs. The smarts are deterministic code.

---

## 📁 Structure

```
shared/            # API contract (types) — single source for backend and frontend
frontend/          # React + Vite (accessible UI, plain language)
  src/components/  # App · SearchForm · Result (+ Distribution) · Listings
backend/
  src/scrapers/    # One adapter per source (CarDataSource)
  src/services/    # comparables · timeAdjust · mileageAdjust · statistics · confidence
  src/routes/      # valuation (?dollar=OFICIAL|BLUE|MEP) · dollar · og (share image)
  fixtures/        # Real HTML for offline tests
Dockerfile + render.yaml  # One-click deploy
```

Adding a source = one class + one line in `registry.ts`. Core untouched.

---

## 👤 Author

**Franco Polesel** — [✉ Email](mailto:francopolesel99@gmail.com) · [GitHub](https://github.com/francopolesel) · [LinkedIn](https://ar.linkedin.com/in/franco-paul-polesel)
