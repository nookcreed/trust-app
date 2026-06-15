"""
Seed MLflow with 60 diverse, realistic eligibility check runs for demo purposes.

Usage:
    python3 scripts/seed_mlflow.py

Requires: MLFLOW_TRACKING_URI=databricks, DATABRICKS_HOST, and either
DATABRICKS_TOKEN or LLM_API_KEY set (via .env).
"""

import os
import sys
import random

# Add project root to path so we can import benefitsiq
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

# Ensure DATABRICKS_TOKEN is set from LLM_API_KEY (same PAT)
if not os.getenv("DATABRICKS_TOKEN") and os.getenv("LLM_API_KEY"):
    os.environ["DATABRICKS_TOKEN"] = os.environ["LLM_API_KEY"]
    print("[seed] DATABRICKS_TOKEN set from LLM_API_KEY")

from benefitsiq.analytics.tracker import setup_mlflow, log_eligibility_check
from benefitsiq.engine.profile import UserProfile, IncomeType

# ── Seed data ─────────────────────────────────────────────────────────────────

STATES = ["GA", "TX", "CA", "FL", "NY", "PA", "OH", "NC", "MI", "WA", "IL", "AZ"]

# Program short names and realistic annual benefit ranges (min, max)
PROGRAMS = {
    "SNAP": (3600, 9192),
    "CHIP": (5000, 8400),
    "WIC": (600, 1200),
    "MEDICAID": (4800, 14400),
    "LIHEAP": (300, 1200),
}

# Persona templates: (label, household_size, monthly_income, income_type,
#                     has_children, has_young_children, is_pregnant,
#                     recently_lost_job, receives_tanf, receives_ssi, renting)
PERSONAS = [
    # Single parent with young kids
    (
        "single_parent_young_kids",
        3,
        1800,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "single_parent_young_kids",
        4,
        2100,
        IncomeType.GIG,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "single_parent_young_kids",
        2,
        1400,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "single_parent_young_kids",
        3,
        900,
        IncomeType.GIG,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "single_parent_young_kids",
        5,
        2400,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    # Recently unemployed
    (
        "recently_unemployed",
        1,
        0,
        IncomeType.NONE,
        False,
        False,
        False,
        True,
        False,
        False,
        True,
    ),
    (
        "recently_unemployed",
        2,
        0,
        IncomeType.UNEMPLOYMENT,
        False,
        False,
        False,
        True,
        False,
        False,
        True,
    ),
    (
        "recently_unemployed",
        3,
        500,
        IncomeType.UNEMPLOYMENT,
        True,
        False,
        False,
        True,
        False,
        False,
        True,
    ),
    (
        "recently_unemployed",
        4,
        800,
        IncomeType.UNEMPLOYMENT,
        True,
        True,
        False,
        True,
        False,
        False,
        False,
    ),
    (
        "recently_unemployed",
        2,
        1200,
        IncomeType.UNEMPLOYMENT,
        False,
        False,
        False,
        True,
        False,
        False,
        True,
    ),
    # Pregnant
    (
        "pregnant",
        1,
        1500,
        IncomeType.EMPLOYMENT,
        False,
        False,
        True,
        False,
        False,
        False,
        True,
    ),
    (
        "pregnant",
        2,
        2200,
        IncomeType.EMPLOYMENT,
        True,
        True,
        True,
        False,
        False,
        False,
        True,
    ),
    ("pregnant", 1, 900, IncomeType.GIG, False, False, True, False, False, False, True),
    (
        "pregnant",
        3,
        1700,
        IncomeType.SELF_EMPLOYMENT,
        True,
        True,
        True,
        False,
        False,
        False,
        False,
    ),
    (
        "pregnant",
        2,
        2800,
        IncomeType.EMPLOYMENT,
        False,
        False,
        True,
        False,
        False,
        False,
        True,
    ),
    # Elderly / SSI
    (
        "elderly_ssi",
        1,
        950,
        IncomeType.SSI,
        False,
        False,
        False,
        False,
        False,
        True,
        True,
    ),
    (
        "elderly_ssi",
        2,
        1200,
        IncomeType.SSI,
        False,
        False,
        False,
        False,
        False,
        True,
        True,
    ),
    (
        "elderly_ssi",
        1,
        800,
        IncomeType.SSDI,
        False,
        False,
        False,
        False,
        False,
        True,
        True,
    ),
    (
        "elderly_ssi",
        1,
        0,
        IncomeType.SSI,
        False,
        False,
        False,
        False,
        False,
        True,
        True,
    ),
    (
        "elderly_ssi",
        2,
        1500,
        IncomeType.SSDI,
        False,
        False,
        False,
        False,
        False,
        True,
        False,
    ),
    # Working poor — large family
    (
        "working_poor_large_family",
        6,
        2800,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "working_poor_large_family",
        5,
        2200,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "working_poor_large_family",
        4,
        1900,
        IncomeType.GIG,
        True,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "working_poor_large_family",
        6,
        3100,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "working_poor_large_family",
        5,
        2600,
        IncomeType.SELF_EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    # TANF recipients
    (
        "tanf_recipient",
        3,
        600,
        IncomeType.NONE,
        True,
        False,
        False,
        False,
        True,
        False,
        True,
    ),
    (
        "tanf_recipient",
        2,
        400,
        IncomeType.NONE,
        True,
        True,
        False,
        False,
        True,
        False,
        True,
    ),
    (
        "tanf_recipient",
        4,
        700,
        IncomeType.NONE,
        True,
        True,
        False,
        False,
        True,
        False,
        True,
    ),
    # Gig economy
    (
        "gig_worker",
        1,
        2100,
        IncomeType.GIG,
        False,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "gig_worker",
        2,
        2600,
        IncomeType.GIG,
        True,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "gig_worker",
        1,
        1600,
        IncomeType.GIG,
        False,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "gig_worker",
        3,
        2900,
        IncomeType.GIG,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    # Self-employed / small business
    (
        "self_employed",
        2,
        3200,
        IncomeType.SELF_EMPLOYMENT,
        False,
        False,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "self_employed",
        3,
        2800,
        IncomeType.SELF_EMPLOYMENT,
        True,
        False,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "self_employed",
        4,
        3400,
        IncomeType.SELF_EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        False,
    ),
    # Housing unstable / renting
    (
        "housing_unstable",
        1,
        1100,
        IncomeType.EMPLOYMENT,
        False,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "housing_unstable",
        2,
        1500,
        IncomeType.EMPLOYMENT,
        True,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "housing_unstable",
        3,
        1800,
        IncomeType.GIG,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    # Near poverty line
    (
        "near_poverty",
        1,
        1340,
        IncomeType.EMPLOYMENT,
        False,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "near_poverty",
        2,
        1820,
        IncomeType.EMPLOYMENT,
        False,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "near_poverty",
        3,
        2290,
        IncomeType.EMPLOYMENT,
        True,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "near_poverty",
        4,
        2760,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        True,
    ),
    # Zero income
    (
        "zero_income",
        1,
        0,
        IncomeType.NONE,
        False,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    (
        "zero_income",
        2,
        0,
        IncomeType.NONE,
        True,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    ("zero_income", 3, 0, IncomeType.NONE, True, True, False, True, False, False, True),
    # Moderate income — borderline
    (
        "moderate_income",
        2,
        2500,
        IncomeType.EMPLOYMENT,
        False,
        False,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "moderate_income",
        3,
        3000,
        IncomeType.EMPLOYMENT,
        True,
        False,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "moderate_income",
        4,
        3200,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "moderate_income",
        1,
        2000,
        IncomeType.EMPLOYMENT,
        False,
        False,
        False,
        False,
        False,
        False,
        True,
    ),
    # Mixed household — disability + employment
    (
        "disability_mixed",
        2,
        1400,
        IncomeType.SSDI,
        False,
        False,
        False,
        False,
        False,
        True,
        True,
    ),
    (
        "disability_mixed",
        3,
        1900,
        IncomeType.SSDI,
        True,
        False,
        False,
        False,
        False,
        True,
        True,
    ),
    (
        "disability_mixed",
        2,
        1100,
        IncomeType.SSI,
        False,
        False,
        False,
        False,
        False,
        True,
        True,
    ),
    # Rural / agricultural
    (
        "rural_ag_worker",
        5,
        2000,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "rural_ag_worker",
        6,
        2400,
        IncomeType.EMPLOYMENT,
        True,
        True,
        False,
        False,
        False,
        False,
        False,
    ),
    (
        "rural_ag_worker",
        4,
        1700,
        IncomeType.EMPLOYMENT,
        True,
        False,
        False,
        False,
        False,
        False,
        False,
    ),
]


def make_results(profile: UserProfile, state: str) -> tuple[list[dict], float]:
    """
    Generate realistic eligibility results for a profile.
    Uses simple income thresholds to decide eligibility (no DB required).
    """
    income = profile.effective_monthly_income or 0.0
    hhsize = profile.household_size or 1

    # Rough FPL monthly thresholds for 2024 (130% for SNAP, 200% for CHIP/WIC, etc.)
    # FPL monthly base ≈ $1,255 for 1-person, +$442 per additional
    fpl_monthly = 1255 + (hhsize - 1) * 442

    results = []
    total_value = 0.0

    # SNAP: 130% FPL gross limit
    snap_limit = fpl_monthly * 1.30
    snap_eligible = (
        income <= snap_limit or profile.receives_tanf or profile.receives_ssi
    )
    snap_value = 0.0
    if snap_eligible:
        snap_max = {1: 291, 2: 535, 3: 766, 4: 973, 5: 1155, 6: 1386}
        snap_monthly = snap_max.get(min(hhsize, 6), 1386)
        snap_value = snap_monthly * 12
    results.append(
        {
            "program_short_name": "SNAP",
            "eligible": snap_eligible,
            "estimated_annual_value": snap_value if snap_eligible else 0,
            "confidence": (
                "likely"
                if snap_eligible and income < snap_limit * 0.85
                else "borderline"
            ),
        }
    )
    total_value += snap_value

    # MEDICAID: 138% FPL (ACA expansion states) or lower
    medicaid_limit = fpl_monthly * 1.38
    # Some states (TX, FL, GA) haven't expanded — harder cutoff
    non_expansion = state in ("TX", "FL", "GA")
    if non_expansion:
        medicaid_limit = fpl_monthly * 0.75
    medicaid_eligible = (
        income <= medicaid_limit or profile.receives_ssi or profile.recently_lost_job
    )
    medicaid_value = 0.0
    if medicaid_eligible:
        medicaid_value = random.randint(4800, 14400)
    results.append(
        {
            "program_short_name": "MEDICAID",
            "eligible": medicaid_eligible,
            "estimated_annual_value": medicaid_value if medicaid_eligible else 0,
            "confidence": "likely" if medicaid_eligible else "unlikely",
        }
    )
    total_value += medicaid_value

    # CHIP: 200% FPL, requires children
    if profile.has_children:
        chip_limit = fpl_monthly * 2.00
        chip_eligible = income <= chip_limit
        chip_value = 0.0
        if chip_eligible:
            num_children = max(1, hhsize - 1)
            chip_value = num_children * random.randint(5000, 8400)
        results.append(
            {
                "program_short_name": "CHIP",
                "eligible": chip_eligible,
                "estimated_annual_value": chip_value if chip_eligible else 0,
                "confidence": (
                    "likely"
                    if chip_eligible and income < chip_limit * 0.85
                    else "borderline"
                ),
            }
        )
        total_value += chip_value

    # WIC: 185% FPL, requires pregnancy or young children
    if profile.is_pregnant or profile.has_young_children:
        wic_limit = fpl_monthly * 1.85
        wic_eligible = income <= wic_limit
        wic_value = 0.0
        if wic_eligible:
            participants = (1 if profile.is_pregnant else 0) + (
                max(1, hhsize - 1) if profile.has_young_children else 0
            )
            wic_value = participants * 50 * 12
        results.append(
            {
                "program_short_name": "WIC",
                "eligible": wic_eligible,
                "estimated_annual_value": wic_value if wic_eligible else 0,
                "confidence": "likely" if wic_eligible else "unlikely",
            }
        )
        total_value += wic_value

    # LIHEAP: 60% State Median Income (rough proxy: ~150% FPL)
    liheap_limit = fpl_monthly * 1.50
    liheap_eligible = income <= liheap_limit or profile.receives_ssi
    liheap_value = 0.0
    if liheap_eligible:
        liheap_value = random.randint(300, 1200)
    results.append(
        {
            "program_short_name": "LIHEAP",
            "eligible": liheap_eligible,
            "estimated_annual_value": liheap_value if liheap_eligible else 0,
            "confidence": "likely" if liheap_eligible else "unlikely",
        }
    )
    total_value += liheap_value

    return results, total_value


def main():
    random.seed(42)  # Reproducible run

    print("[seed] Setting up MLflow...")
    setup_mlflow()

    state_cycle = STATES * 10  # enough states for all personas
    logged = 0

    for i, persona in enumerate(PERSONAS):
        (
            label,
            hhsize,
            income,
            income_type,
            has_children,
            has_young_children,
            is_pregnant,
            recently_lost_job,
            receives_tanf,
            receives_ssi,
            renting,
        ) = persona

        state = state_cycle[i % len(state_cycle)]

        profile = UserProfile(
            state=state,
            household_size=hhsize,
            monthly_gross_income=float(income),
            income_type=income_type,
            has_children=has_children,
            has_young_children=has_young_children,
            is_pregnant=is_pregnant,
            recently_lost_job=recently_lost_job,
            receives_tanf=receives_tanf,
            receives_ssi=receives_ssi,
            renting=renting,
            housing_unstable=renting and income < 1500,
        )

        results, total_value = make_results(profile, state)

        print(
            f"[seed] Run {i+1:02d}/{len(PERSONAS)}: {label} | {state} HH{hhsize} "
            f"${income}/mo | qualifying={sum(1 for r in results if r['eligible'])} "
            f"| total=${total_value:,.0f}"
        )
        log_eligibility_check(profile, results, total_value)
        logged += 1

    print(
        f"\n[seed] Done. Logged {logged} runs to MLflow experiment '/benefitsiq-eligibility-checks'."
    )


if __name__ == "__main__":
    main()
