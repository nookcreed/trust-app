"""
Seed ILLUSTRATIVE demo impact events so the Impact dashboard is populated on stage.

HONESTY NOTE: these are synthetic, modeled events — NOT real families served. The volume and
geographic distribution are modeled on real program-participation patterns so the dashboard
looks alive and the k-anonymity suppression (small-count states hidden) is demonstrable. The
Impact tab should carry an "illustrative data" label. Run once:

    python3 scripts/seed_demo_impact.py
"""

import os
import random
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/db/benefitsiq.db")

from benefitsiq.db.session import init_db, get_session
from benefitsiq.db.models import ImpactEvent

# State weights ~ population (drives a realistic distribution; big states clear the k-anon floor,
# small states stay below it so suppression is visible in the demo).
STATE_WEIGHTS = {
    "CA": 39,
    "TX": 30,
    "FL": 22,
    "NY": 19,
    "PA": 13,
    "IL": 12,
    "OH": 12,
    "GA": 11,
    "NC": 11,
    "MI": 10,
    "NJ": 9,
    "VA": 9,
    "WA": 8,
    "AZ": 7,
    "TN": 7,
    "MA": 7,
    "MO": 6,
    # deliberately tiny counts → should be SUPPRESSED by k-anon:
    "WY": 1,
    "VT": 1,
    "AK": 1,
}

# Per-program modeled annual value (USD) — mirrors the engine's estimates.
PROGRAM_VALUE = {
    "SNAP": 9192,
    "CHIP": 3600,
    "WIC": 600,
    "LIHEAP": 500,
    "MEDICAID": 0,
    "NSLP": 900,
}
PROGRAM_BUNDLES = [
    ["SNAP", "MEDICAID"],
    ["SNAP", "CHIP", "WIC"],
    ["SNAP", "CHIP", "NSLP"],
    ["SNAP", "LIHEAP"],
    ["MEDICAID", "CHIP"],
    ["SNAP", "MEDICAID", "CHIP", "WIC", "LIHEAP"],
]

TOTAL_EVENTS = 620


def main():
    rng = random.Random(42)  # deterministic seed
    init_db()
    states = list(STATE_WEIGHTS)
    weights = list(STATE_WEIGHTS.values())
    base = datetime.now(timezone.utc)

    with get_session() as session:
        existing = session.query(ImpactEvent).count()
        if existing > 50:
            print(
                f"Impact table already has {existing} events — skipping (delete to re-seed)."
            )
            return
        for i in range(TOTAL_EVENTS):
            state = rng.choices(states, weights=weights, k=1)[0]
            hh = rng.randint(1, 6)
            bundle = rng.choice(PROGRAM_BUNDLES)
            kids = max(1, hh - 1)
            value = sum(
                PROGRAM_VALUE[p] * (kids if p in ("CHIP", "NSLP", "WIC") else 1)
                for p in bundle
            )
            session.add(
                ImpactEvent(
                    created_at=(base - timedelta(days=rng.randint(0, 90))).isoformat(),
                    state=state,
                    household_size=hh,
                    programs_found=len(bundle),
                    estimated_annual_value=float(value),
                    programs_list=bundle,
                )
            )
        session.commit()
    print(
        f"Seeded {TOTAL_EVENTS} ILLUSTRATIVE impact events across {len(states)} states."
    )
    print("NOTE: synthetic demo data — label the Impact tab as illustrative.")


if __name__ == "__main__":
    main()
