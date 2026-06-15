# BenefitsIQ — 3-Minute Demo Video Script & Storyboard

**Total runtime target: 2:55** (hard cap 3:00 — Stage One disqualifies anything over).
Every segment is tagged with the judging criterion it serves so the video covers all five.

Two ways to produce the visual:
- **Option A (recommended): screen-record the live app** at https://benefitsiq-app-7474659675348398.aws.databricksapps.com while reading the voiceover. Use the exact inputs in the SHOT column.
- **Option B: record the How It Works page** — use the "Try it yourself" custom profile form to show the deterministic engine in action without chat. Great for B-roll.

Record voiceover separately (QuickTime / phone) and lay it over the screen capture, or read live. Keep pace calm — ~145 words/min.

---

| Time | VOICEOVER (read this) | SHOT / on-screen | Criterion |
|------|----------------------|------------------|-----------|
| 0:00–0:18 | "Every year, more than **sixty billion dollars** in U.S. government benefits goes unclaimed. Not because families don't qualify — but because no one ever tells them what they've earned. SNAP, Medicaid, WIC, energy help — scattered across dozens of agencies, written in language nobody can parse." | Title card: **BenefitsIQ** over the warm landing screen. Big stat "$60B unclaimed / year" fades in. | (a) Business |
| 0:18–0:34 | "You could ask a general chatbot. But ask ChatGPT if you qualify for SNAP, and it *guesses* — confidently, and sometimes wrong. For a benefits decision, a confident wrong answer is the worst answer." | Split: a generic chat bubble with a ⚠️ "hallucinated" tag. | (c) Creativity |
| 0:34–0:52 | "BenefitsIQ is different by design. **The language model only handles language. A deterministic engine decides eligibility** — from real federal rules. The model never decides whether you qualify. So the answer is explainable, repeatable, and citable." | Architecture mini-diagram: LLM (language) → Engine (law) → Lakebase. Highlight "no hallucinated eligibility." | (c) Creativity / (e) |
| 0:52–1:35 | "Here's a family. *'I just lost my job in Georgia, I have two kids.'* That's it — plain English. BenefitsIQ asks only what it needs, then produces a **Statement of Benefits**: the programs they likely qualify for across all 8 programs — SNAP, Medicaid, TANF, Section 8, WIC, and more — a real dollar value — here, over **nineteen thousand dollars a year** — and a **source citation for every line**." | Type `Lost my job in Georgia, 2 kids`; show typing dots → reply → Statement card animates: total counts up, SNAP/Medicaid/TANF/Section 8/WIC/School Meals each with $ and source. Scroll to show chatbot comparison card. | (d) Thoroughness |
| 1:35–1:58 | "And it's personal. **'Families like you'** shows what similar households actually did first, and how long it took — drawn from anonymized, k-anonymous cohorts, never any one person's data." | Scroll to "Families like you" panel: apply-order, avg processing days, "n=…". | (d) / privacy |
| 1:58–2:30 | "Under the hood it's Databricks end to end. Federal rules for all 8 programs and **real U.S. Census data** live in **Unity Catalog**, synced into **Lakebase** serverless Postgres for sub-second lookups via a service principal. The TypeScript backend runs a deterministic eligibility engine backed by 66 unit tests. Language runs on **Model Serving** — Llama 3.3 70B. It's serverless and **scales to zero**, so cost is linear with traffic — and every new program is just data, not a rewrite." | Show the stack: Unity Catalog → Lakebase synced tables → Model Serving. Overlay icons + "scale-to-zero · linear cost · plugin-extensible · 66 unit tests". | (b) Data / (e) Architecture |
| 2:30–2:48 | "Eligibility you can audit. Citations you can check. Personalization that protects privacy. BenefitsIQ turns sixty billion unclaimed dollars into benefits families can actually claim." | Statement card + "211 for urgent help" line; impact stat "$X identified". | (a) / (c) |
| 2:48–2:55 | "BenefitsIQ. Built on Databricks, for good." | End card: logo + live URL + GitHub (github.com/nookcreed). | close |

---

## Exact demo inputs (Option A, live app)
1. Click quick-start chip **"Lost my job in Georgia, 2 kids"** (or type it).
2. If it asks for income, type: `No income right now`.
3. Let the Statement of Benefits render; scroll slowly through all 8 programs (including TANF and Section 8) → "Families like you".
4. Point out the **chatbot comparison card** that shows what a generic chatbot would say vs. BenefitsIQ's cited, deterministic answer.
5. (Optional B-roll) Navigate to **How It Works** and use the **"Try it yourself"** custom profile form to demonstrate the deterministic engine directly.
6. (Optional B-roll) open the repo README to show the architecture diagram and the 66 unit tests.

## Tips
- Record at 1920×1080, Chrome, zoom 100–110%.
- Trim dead air during the LLM call (1–2s) so the 0:52–1:35 block stays tight.
- Caption the dollar total and the word "citation" on screen — judges skim.
- Keep total **under 3:00**. If long, trim 0:18–0:34 (the ChatGPT contrast) first.
