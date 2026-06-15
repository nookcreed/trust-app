"""
Seed ILLUSTRATIVE prior eligibility checks (CheckLog rows) for the demo.

Purpose: the "Rule Change / Lineage" tab re-evaluates stored checks when SNAP thresholds reset
on Oct 1 and shows exactly who flips eligibility. With only a couple of stored checks the moment
underwhelms; this seeds ~60 realistic prior cases — including ~18 income "straddlers" sitting
just above the baseline SNAP gross limit but below the post-reset limit, so they newly qualify.

HONESTY NOTE: synthetic demo cases, not real households. Judges understand a demo is seeded.
Run once:  python3 scripts/seed_demo_checks.py
"""

import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/db/benefitsiq.db")

from benefitsiq.db.session import init_db, get_session
from benefitsiq.db.checks import CheckLog, all_checks, record_check
from benefitsiq.engine.profile import UserProfile

# 130% FPL monthly gross SNAP limit by household size (2024 baseline).
SNAP_LIMIT = {1: 1631, 2: 2214, 3: 2797, 4: 3380, 5: 3963, 6: 4546}
STATES = ["CA", "TX", "FL", "NY", "GA", "OH", "NC", "MI", "PA", "IL", "AZ", "WA"]


def main():
    rng = random.Random(7)
    init_db()
    with get_session() as session:
        existing = [c for c in all_checks(session) if c.profile_snapshot]
        # Remove the tiny auto-seeded demo set so we control the distribution.
        if 0 < len(existing) <= 5:
            for c in existing:
                session.delete(c)
            session.flush()
        elif len(existing) > 5:
            print(f"CheckLog already has {len(existing)} rows — skipping.")
            return

        n_straddlers = 0
        for i in range(60):
            state = rng.choice(STATES)
            hh = rng.randint(1, 5)
            limit = SNAP_LIMIT[hh]
            kind = rng.random()
            if kind < 0.30:
                # Straddler: just above baseline limit, below the ~3.2% reset limit → will flip.
                income = round(limit * rng.uniform(1.005, 1.028))
                n_straddlers += 1
            elif kind < 0.65:
                income = round(limit * rng.uniform(0.40, 0.92))  # clearly eligible
            else:
                income = round(limit * rng.uniform(1.10, 1.60))  # clearly ineligible
            profile = UserProfile(
                state=state,
                household_size=hh,
                monthly_gross_income=float(income),
                has_children=(hh > 1 and rng.random() < 0.7),
                recently_lost_job=rng.random() < 0.4,
            )
            record_check(
                session, profile, qualifying=[], ruleset_version="2024-baseline"
            )
        session.commit()
    print(
        f"Seeded 60 illustrative prior checks ({n_straddlers} straddlers that flip on the SNAP reset)."
    )


if __name__ == "__main__":
    main()
