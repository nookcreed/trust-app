# Trust Desk — 3-Minute Demo Talk Track

**Target**: Databricks Innovation Summit 2026 Hackathon Judges
**App**: https://trustdesk-app-7474659675348398.aws.databricksapps.com
**Hit list**: Databricks App, provided dataset, non-technical workflow, cited evidence, honest uncertainty, persisted user actions

---

## [0:00–0:15] THE OPENER — Make It Personal

> "Imagine you're a health planner in rural India. You need to refer a patient for cardiac surgery. You pull up the directory and find a hospital that lists cardiology, neurology, urology — **14 specialties**. Sounds great. Except it has **two doctors**."
>
> "That's not a hypothetical. That's a real facility in this dataset."

**[Why it works: Judges feel the stakes immediately. No abstract setup.]**

---

## [0:15–0:45] THE REVEAL — Let the Data Shock

> *[On Explorer page — point at the key finding cards]*
>
> "We analyzed all 10,000 facilities in the hackathon dataset. Here's what we found."
>
> *[Point at each card in sequence — left to right]*
>
> "**2,307 facilities** claim specialties their staffing can't support. **126** report zero doctors. **127** report zero beds. And **95%** have no accreditation whatsoever."
>
> "This isn't a data quality problem. This is a **patient safety problem**."
>
> *[Click "Shaurya Hospital — 2 doctors, 14 specialties"]*

**[Requirement: Uses the provided facility dataset]**

---

## [0:45–1:15] THE DEEP DIVE — Evidence, Not Opinions

> *[Shaurya facility detail page loads with trust score]*
>
> "Shaurya Hospital. **Trust score: 12 out of 100.** But I don't want you to trust that number — I want you to see *why*."
>
> *[Expand Claims vs Evidence dimension]*
>
> "Every score comes with an evidence chain. **Claim**: 'Offers 14 specialties.' **Finding**: 'Only 2 doctors — ratio of 7:1, cannot plausibly staff 14 specialties.' **Source**: staffing-ratio-check."
>
> *[Gesture at the evidence items]*
>
> "This isn't a chatbot guessing. Every finding traces back to a specific field in the dataset, a specific rule in the engine, and a specific reason it matters."

**[Requirement: Cite underlying facility text for any claim, score, or ranking]**

---

## [1:15–1:45] THE ARCHITECTURE — The Slide That Changes Minds

> *[Navigate to How It Works page]*
>
> "Here's the design decision that makes this different from every other AI demo you'll see today."
>
> *[Point at architecture diagram]*
>
> "**The LLM reads. The engine decides.** The LLM understands messy text — it parses specialty names, it interprets your search. But it **never** scores trust. That's pure deterministic functions. Same input, same output, every time."
>
> *[Point at test badge]*
>
> "**129 unit tests.** This isn't a chatbot wrapper — it's an auditable scoring engine that a health ministry could put in production."

**[Requirement: Runs as a Databricks App — AppKit, Lakebase, Foundation Model Serving]**

---

## [1:45–2:10] HONEST UNCERTAINTY — What Others Fake, We Show

> *[Scroll to Live Engine Demo, search "Apollo"]*
>
> "Now watch what happens with a well-resourced facility."
>
> *[Select Apollo Adlux Hospital]*
>
> "Apollo Adlux — 150 doctors, NABH-accredited. Much higher trust score. But look — **2 of 7 dimensions say 'Insufficient Data.'**"
>
> "Most systems would either guess or penalize. We do neither. We **renormalize** — score only what we can evidence. A facility scored 80 on 5 dimensions gets an **80**, not a 57."
>
> "When we don't know, we say we don't know. That's not a limitation — that's the feature."

**[Requirement: Communicate uncertainty instead of presenting weak evidence as fact]**

---

## [2:10–2:40] THE WORKFLOW — Built for Planners, Not Engineers

> *[Navigate to Explorer, type "Hospitals in Kerala with cardiology"]*
>
> "Natural language search. No SQL, no query syntax."
>
> *[Click a result, scroll to Planner Notes]*
>
> "A health planner finds a suspicious facility, reviews the trust profile, and then — "
>
> *[Type: "Staffing ratio needs field verification before network inclusion." Select dimension: Staffing Adequacy. Select decision: Flag for Review. Save.]*
>
> "— flags it with a note, ties it to a dimension, records a decision. That note **persists in Lakebase**. It creates a decision trail that a supervisor can audit."

**[Requirement: Non-technical workflow + Persist user actions]**

---

## [2:40–3:00] THE CLOSE — One Line They Remember

> *[Back to Explorer — gesture at the dashboard]*
>
> "10,000 facilities. 51 data points each. Seven trust dimensions. Zero hallucination."
>
> "Ask any chatbot if a hospital is trustworthy — you'll get a confident paragraph you can't verify."
>
> "Ask Trust Desk — you'll get a **score you can trace, evidence you can check, and uncertainty you can trust.**"
>
> *[Pause. Make eye contact.]*
>
> "Thank you."

---

## Cheat Sheet — What to Click, In Order

| Time | Action | Page |
|------|--------|------|
| 0:00 | Start on Explorer, have it pre-loaded | Explorer `/` |
| 0:15 | Point at key finding cards, let numbers land | Explorer `/` |
| 0:35 | Click "Shaurya Hospital" star facility link | Detail `/facility/fadba1a4...` |
| 0:45 | Score visible — expand Claims vs Evidence | Detail page |
| 1:15 | Navigate to How It Works | How It Works `/how-it-works` |
| 1:25 | Point at architecture diagram + test badge | How It Works |
| 1:45 | Scroll to Live Engine Demo, search "Apollo" | How It Works |
| 2:00 | Show insufficient data dimensions | How It Works |
| 2:10 | Navigate to Explorer, type search | Explorer `/` |
| 2:20 | Click a result, scroll to Planner Notes | Detail page |
| 2:30 | Add note + dimension + decision, save | Detail page |
| 2:40 | Back to Explorer for closing statement | Explorer `/` |

## Delivery Tips

- **The opener is everything.** Don't rush it. Let "two doctors" land before moving on.
- **Numbers are punchlines.** Pause *before* each number, not after. "We found... *pause*... 2,307 facilities."
- **Don't read the screen.** The audience can see the score. Tell them what it *means*.
- **The close is a contrast.** Slow down. "Confident paragraph you can't verify" vs "score you can trace." Let the rhythm do the work.
- **If you run long**, cut the Apollo section (1:45–2:10). The Shaurya deep dive already proves the engine works.

## Backup — If Something Breaks

- **App slow to load?** "Lakebase cold start — takes a couple seconds. Worth the wait." Keep talking.
- **Chat search fails?** Click star facility links directly — they bypass search entirely.
- **Trust profile not loading?** Refresh once. If still broken: "The engine runs 129 tests — let me show you the architecture instead."
- **Planner notes API down?** "Notes persist to Lakebase — here's the schema in Data Catalog." Navigate to `/data`.
- **Any 500 error?** "Real systems, real errors. That's exactly why every score is deterministic — refresh and you get the same result."
