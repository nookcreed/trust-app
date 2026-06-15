#!/usr/bin/env python3
"""
Seed cohort statistics table from real federal data.

Run this once to populate the cohort_stats table with modeled precedent data.
Safe to run multiple times (idempotent - will clear and re-seed).

Usage:
    python3 scripts/seed_cohorts.py
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from benefitsiq.db.session import init_db, get_session
from benefitsiq.cohorts.ingest import seed_cohorts


def main():
    print("Initializing database (creating tables if needed)...")
    init_db()

    print("Seeding cohort statistics from federal data...")
    with get_session() as session:
        count = seed_cohorts(session)

    print(f"✅ Seeded {count} cohort statistics")
    print(
        "\nCohorts are now available for precedent matching via get_similar_cases tool."
    )


if __name__ == "__main__":
    main()
