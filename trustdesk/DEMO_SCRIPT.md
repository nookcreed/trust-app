# Trust Desk — 3-Minute Demo Talk Track

**Target**: Databricks Innovation Summit 2026 Hackathon Judges
**App**: https://trustdesk-app-7474659675348398.aws.databricksapps.com
**Hit list**: Databricks App, provided dataset, non-technical workflow, cited evidence, honest uncertainty, persisted user actions

---

## [0:00–0:15] THE OPENER — Make It Personal

> "Imagine you're a health planner in rural India. You need to refer a patient for cardiac surgery. You pull up the directory and find a hospital that lists cardiology, neurology, urology — **14 specialties**. Sounds great. Except it has **two doctors**."
>
> "That's not a hypothetical. That's a real facility in this dataset."

---

## [0:15–0:40] THE DASHBOARD — Let the Data Shock

> *[On Explorer page — point at the hero stats]*
>
> "We ran all 10,000 facilities through a deterministic trust engine. Here's what it found."
>
> "**2,307** claim specialties their staffing can't support. **126** report zero doctors. **127** report zero beds. **95%** have no accreditation."
>
> *[Click "Shaurya Hospital — 2 doctors, 14 specialties"]*

**[Requirement: Uses the provided facility dataset]**

---

## [0:40–1:15] THE DEEP DIVE — One Facility, Full Tour

> *[Detail page loads — trust gauge shows 72]*
>
> "Shaurya Hospital. **72 out of 100 — Moderate Trust.** Sounds fine, right? That's the danger of a single number. Let's drill in."
>
> *[Expand Staffing Adequacy (50/100)]*
>
> "Staffing Adequacy: **50 out of 100.** The claim: '2 doctors cover 14 specialties.' The finding: 'Ratio of 1 doctor per 7 specialties — not credible.' That's a critical flag hiding inside a moderate composite score."
>
> *[Click Flags tab — 3 flags]*
>
> "Flags tab — all the red and yellow flags in one place. Staffing is critical. No accreditation found. Internal consistency issues. A planner sees what needs attention without reading every dimension."
>
> *[Click Download Report]*
>
> "One click: **print-ready report**. Every dimension, every flag, every evidence item."

**[Requirement: Cite underlying facility text for any claim, score, or ranking]**

---

## [1:15–1:50] THE ENGINE — Architecture + Live Demo

> *[Navigate to How It Works]*
>
> "Here's the design decision that separates this from every other AI demo."
>
> *[Point at architecture diagram]*
>
> "**The LLM reads language. The engine decides trust.** Never mixed. The LLM parses messy specialty names and interprets your search. It never scores or ranks trust. That's all deterministic — **129 unit tests** prove it."
>
> *[Scroll to Live Engine Demo — click Apollo Adlux star button]*
>
> "This is live — I can score any of the 10,000 facilities right now. Apollo Adlux: **80 out of 100, High Trust.** 150 doctors, NABH-accredited. But even Apollo gets flagged — 10 specialties with no matching equipment, 32 duplicate entries. The engine doesn't give anyone a free pass."
>
> "And when data *is* missing for a dimension, the engine doesn't guess or penalize — it marks it 'Insufficient Data' and **renormalizes** the score across only the dimensions it can evidence. Honest math, not fake confidence."

**[Requirement: Databricks App (AppKit, Lakebase, Foundation Model Serving)]**
**[Requirement: Communicate uncertainty instead of presenting weak evidence as fact]**

---

## [1:50–2:35] THE WORKFLOW — Search, Review, Decide

> *[Navigate to Explorer — type "Hospitals in Kerala with cardiology"]*
>
> "Natural language search — no SQL, no query syntax. The LLM extracts intent, the database executes."
>
> *[Results appear — click on a facility, scroll to Planner Notes]*
>
> "A planner finds a facility, reviews the trust profile, and makes a decision."
>
> *[Type: "Staffing ratio needs field verification before network inclusion." Select dimension: Staffing Adequacy. Select decision: Flag for Review. Save.]*
>
> "That note **persists in Lakebase** — tied to this facility, tagged to a dimension, with a decision on record. Audit trail."
>
> *[Navigate to Data Catalog]*
>
> "Everything runs on Databricks end to end. Unity Catalog tables with live row counts — facilities, PIN codes, district health data, clinical knowledge. Full data lineage, full provenance."

**[Requirement: Non-technical workflow + Persist user actions]**

---

## [2:35–3:00] THE CLOSE — One Line They Remember

> *[Back to Explorer]*
>
> "10,000 facilities. Seven trust dimensions. Zero hallucination."
>
> "Ask any chatbot if a hospital is trustworthy — you get a confident paragraph you can't verify."
>
> "Ask Trust Desk — you get a **score you can trace, evidence you can check, and uncertainty you can trust.**"
>
> *[Pause.]*
>
> "Thank you."

---

## Cheat Sheet — Click Order

| Time | Action | Page |
|------|--------|------|
| 0:00 | Start on Explorer, pre-loaded | Explorer `/` |
| 0:15 | Point at 4 hero stat cards | Explorer |
| 0:35 | Click Shaurya star link | Detail `/facility/fadba1a4...` |
| 0:40 | Expand Staffing Adequacy (50/100) | Detail — Dimensions tab |
| 0:55 | Click Flags tab (3 flags) | Detail — Flags tab |
| 1:10 | Click Download Report | Detail page |
| 1:15 | Navigate to How It Works | How It Works |
| 1:25 | Point at architecture diagram + test badge | How It Works |
| 1:35 | Click Apollo Adlux star in Live Engine Demo | How It Works |
| 1:45 | Point at Apollo's flags + mention renormalization | How It Works |
| 1:50 | Navigate to Explorer, type search | Explorer |
| 2:05 | Click result, scroll to Planner Notes | Detail page |
| 2:20 | Save note with dimension + decision | Detail page |
| 2:25 | Navigate to Data Catalog | Data Catalog `/data` |
| 2:35 | Back to Explorer for close | Explorer |

## Delivery Tips

- **The opener is everything.** Let "two doctors" land before you move on.
- **Numbers are punchlines.** Pause *before* each number. "We found... *pause*... 2,307."
- **Don't read the screen.** They can see the score. Tell them what it *means*.
- **Shaurya = "looks OK, drill in, find the problem."** That's the whole thesis.
- **Apollo = "even the best get flagged."** Quick contrast, don't linger.
- **The close is a contrast.** Slow down. Let the rhythm do the work.
- **If you run long**, cut the Data Catalog visit and say "Unity Catalog, Lakebase" verbally in the close.

## Backup — If Something Breaks

- **App slow?** "Lakebase cold start — couple seconds." Keep talking through it.
- **Search fails?** Click star facility links — they bypass search entirely.
- **Trust profile won't load?** Refresh once. If still down: "129 tests verify the engine — let me show the architecture instead."
- **Any 500?** "Real systems, real errors. That's why every score is deterministic — refresh, same result."
