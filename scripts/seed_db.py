"""
Build the benefits database.

Usage:
    python scripts/seed_db.py               # curated rules only (offline)
    python scripts/seed_db.py --live        # + live benefits.gov program catalog
    python scripts/seed_db.py --probe       # inspect benefits.gov API shape, then exit
"""

import sys
import os
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from benefitsiq.db.session import init_db, get_session
from benefitsiq.ingest.snap import seed_fpl, seed_snap
from benefitsiq.ingest.medicaid import seed_medicaid
from benefitsiq.ingest.liheap import seed_liheap
from benefitsiq.ingest.chip import seed_chip
from benefitsiq.ingest.wic import seed_wic
from benefitsiq.ingest.nslp import seed_nslp
from benefitsiq.ingest.data_sources import seed_data_sources
from benefitsiq.ingest import gsa_benefits


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--live",
        action="store_true",
        help="Sync live program catalog from GSA benefit-finder",
    )
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Probe GSA benefit-finder data shape and exit",
    )
    args = parser.parse_args()

    if args.probe:
        gsa_benefits.probe()
        return

    print("Creating schema...")
    init_db()

    with get_session() as session:
        print("Seeding FPL thresholds (2024)...")
        seed_fpl(session)

        print("Seeding SNAP eligibility rules...")
        seed_snap(session)

        print("Seeding Medicaid eligibility rules (all 50 states + DC)...")
        seed_medicaid(session)

        print("Seeding LIHEAP eligibility rules (GA/TX/CA + federal baseline)...")
        seed_liheap(session)

        print("Seeding CHIP eligibility rules (all 50 states + DC)...")
        seed_chip(session)

        print("Seeding WIC eligibility rules (GA/TX/CA)...")
        seed_wic(session)

        print("Seeding NSLP eligibility rules (federal baseline)...")
        seed_nslp(session)

        print("Seeding data source provenance...")
        seed_data_sources(session)

    if args.live:
        print("\nSyncing live program catalog from GSA benefit-finder...")
        with get_session() as session:
            gsa_benefits.sync(session)
    else:
        print(
            "\nSkipped live GSA sync (run with --live to pull real government catalog)."
        )

    print("\nDatabase ready.")


if __name__ == "__main__":
    main()
