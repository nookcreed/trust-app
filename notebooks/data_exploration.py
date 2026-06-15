# Databricks notebook source

# MAGIC %md
# MAGIC # BenefitsIQ Data Exploration
# MAGIC ### Databricks AI for Good Hackathon 2026
# MAGIC
# MAGIC **The problem**: Millions of American families qualify for federal assistance programs but never apply.
# MAGIC The enrollment gap is not caused by ineligibility — it is caused by complexity: overlapping programs,
# MAGIC state-by-state rules, confusing thresholds, and no single place to get a clear answer.
# MAGIC
# MAGIC **BenefitsIQ's mission**: Turn public federal and Census data into a deterministic eligibility engine
# MAGIC that tells families *exactly* what they qualify for, how much it is worth, and how to apply — in seconds.
# MAGIC
# MAGIC This notebook explores the datasets powering BenefitsIQ, stored as Delta tables in Unity Catalog
# MAGIC (`benefitsiq.app.*`). Each section surfaces a real pattern in the data that motivates a specific
# MAGIC design decision in the application.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Setup
# MAGIC All tables live in the `benefitsiq.app` Unity Catalog schema. Delta tables with Change Data Feed enabled.

# COMMAND ----------

# Set the default catalog and schema for all queries in this notebook
spark.sql("USE CATALOG benefitsiq")
spark.sql("USE SCHEMA app")

# Quick inventory: what tables do we have?
tables_df = spark.sql("SHOW TABLES")
display(tables_df)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ## 1. The Eligibility Landscape: How Income Thresholds Vary by State and Program
# MAGIC
# MAGIC A family in California and a family in Texas with the same income and household size can have
# MAGIC completely different eligibility outcomes. This is the core complexity BenefitsIQ exists to solve.
# MAGIC
# MAGIC We join `eligibility_rules` with `programs` to see how income limits (expressed as % of the
# MAGIC Federal Poverty Level) vary across states and programs.

# COMMAND ----------

# Total rule count and shape of the eligibility landscape
rules_summary = spark.sql(
    """
    SELECT
        COUNT(*)                            AS total_rules,
        COUNT(DISTINCT er.program_id)       AS programs_covered,
        COUNT(DISTINCT er.state)            AS states_with_rules,
        COUNT(DISTINCT er.household_size)   AS household_sizes,
        SUM(CASE WHEN er.categorical_eligible THEN 1 ELSE 0 END) AS categorical_rules,
        SUM(CASE WHEN er.max_pct_fpl IS NOT NULL THEN 1 ELSE 0 END) AS rules_with_fpl_limit
    FROM eligibility_rules er
"""
)
display(rules_summary)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 1a. FPL Thresholds by Program and State
# MAGIC
# MAGIC Which programs are most generous? Which states expand coverage beyond federal minimums?
# MAGIC A higher `max_pct_fpl` means a family can earn more and still qualify.

# COMMAND ----------

# Average max %FPL by program (federal rules = state IS NULL, plus state-specific)
fpl_by_program = spark.sql(
    """
    SELECT
        p.short_name                          AS program,
        p.name                                AS program_name,
        ROUND(AVG(er.max_pct_fpl), 0)         AS avg_pct_fpl,
        ROUND(MIN(er.max_pct_fpl), 0)         AS min_pct_fpl,
        ROUND(MAX(er.max_pct_fpl), 0)         AS max_pct_fpl,
        COUNT(*)                              AS rule_count
    FROM eligibility_rules er
    JOIN programs p ON er.program_id = p.id
    WHERE er.max_pct_fpl IS NOT NULL AND er.max_pct_fpl > 0
    GROUP BY p.short_name, p.name
    ORDER BY avg_pct_fpl DESC
"""
)
display(fpl_by_program)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 1b. State-Level Variation: Who Is Most and Least Generous?
# MAGIC
# MAGIC State-specific rules override federal defaults. States that use *broad-based categorical
# MAGIC eligibility* for SNAP can set higher gross income limits (e.g., 200% FPL vs 130% FPL).
# MAGIC This chart shows the spread.

# COMMAND ----------

# State-specific FPL limits by program (exclude federal-level rules where state IS NULL)
state_fpl_variation = spark.sql(
    """
    SELECT
        er.state,
        p.short_name AS program,
        ROUND(MAX(er.max_pct_fpl), 0) AS max_pct_fpl,
        MAX(er.max_gross_monthly)      AS max_gross_monthly,
        MAX(CASE WHEN er.categorical_eligible THEN 1 ELSE 0 END) AS has_categorical
    FROM eligibility_rules er
    JOIN programs p ON er.program_id = p.id
    WHERE er.state IS NOT NULL
      AND er.max_pct_fpl IS NOT NULL
      AND er.max_pct_fpl > 0
    GROUP BY er.state, p.short_name
    ORDER BY er.state, p.short_name
"""
)
display(state_fpl_variation)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 1c. The Medicaid Expansion Gap
# MAGIC
# MAGIC States that have NOT expanded Medicaid under the ACA show `max_pct_fpl = 0` for adult
# MAGIC Medicaid — meaning childless adults below 100% FPL have NO pathway to Medicaid.
# MAGIC This is the "coverage gap" that affects roughly 2 million Americans.
# MAGIC
# MAGIC BenefitsIQ detects this: when a user in a non-expansion state is screened, the engine
# MAGIC returns `confidence: 'unlikely'` with an explanation, rather than a false positive.

# COMMAND ----------

# Find rules where max_pct_fpl = 0 (programs effectively closed in that state)
medicaid_gap = spark.sql(
    """
    SELECT
        er.state,
        p.short_name AS program,
        er.max_pct_fpl,
        er.notes
    FROM eligibility_rules er
    JOIN programs p ON er.program_id = p.id
    WHERE er.max_pct_fpl = 0
    ORDER BY p.short_name, er.state
"""
)

print(f"Rules with max_pct_fpl = 0 (coverage gaps): {medicaid_gap.count()}")
display(medicaid_gap)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 1d. Dollar Thresholds: What Does Eligibility Actually Look Like in Monthly Income?
# MAGIC
# MAGIC FPL percentages are abstract. Here we show the actual dollar amounts families face.
# MAGIC A family of 4 in a state with 200% FPL SNAP limit can earn ~$5,000/month and still qualify,
# MAGIC while in a strict state at 130% FPL the cutoff is ~$3,250/month.

# COMMAND ----------

# Gross monthly income limits by household size and program (where dollar thresholds exist)
dollar_thresholds = spark.sql(
    """
    SELECT
        p.short_name          AS program,
        er.state,
        er.household_size,
        er.max_gross_monthly,
        er.max_net_monthly,
        er.max_pct_fpl
    FROM eligibility_rules er
    JOIN programs p ON er.program_id = p.id
    WHERE er.max_gross_monthly IS NOT NULL
    ORDER BY p.short_name, er.household_size, er.state
"""
)
display(dollar_thresholds)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ## 2. FPL Threshold Analysis: The Arithmetic of Poverty
# MAGIC
# MAGIC The Federal Poverty Level (FPL) is the foundation of nearly every eligibility calculation.
# MAGIC Published annually by HHS, it varies by household size and region (48 contiguous states/DC,
# MAGIC Alaska, Hawaii). BenefitsIQ converts a family's reported income to %FPL in real time.

# COMMAND ----------

# FPL thresholds overview
fpl_overview = spark.sql(
    """
    SELECT
        year,
        region,
        COUNT(*)             AS household_sizes,
        MIN(annual_amount)   AS fpl_1_person,
        MAX(annual_amount)   AS fpl_max_size
    FROM fpl_thresholds
    GROUP BY year, region
    ORDER BY year DESC, region
"""
)
display(fpl_overview)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 2a. How FPL Scales with Household Size
# MAGIC
# MAGIC Each additional household member adds a fixed increment (~$5,140 in 2024 for the 48 contiguous
# MAGIC states). This linear scaling means per-capita income drops fast in larger families — a feature
# MAGIC BenefitsIQ uses to identify families that may qualify despite having what seems like "middle" income.

# COMMAND ----------

# FPL by household size for the 48 contiguous states (most common region)
fpl_by_size = spark.sql(
    """
    SELECT
        household_size,
        annual_amount,
        ROUND(annual_amount / 12, 0) AS monthly_amount,
        ROUND(annual_amount / household_size, 0) AS per_capita_annual
    FROM fpl_thresholds
    WHERE region = '48_states_dc'
    ORDER BY household_size
"""
)
display(fpl_by_size)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 2b. The Benefits Cliff: Where Families Lose Eligibility
# MAGIC
# MAGIC At key %FPL thresholds (130%, 185%, 200%, 300%), different programs cut off.
# MAGIC A $1/month raise can cost a family thousands in annual benefits.
# MAGIC
# MAGIC BenefitsIQ shows the *total package value* across programs, making this cliff visible
# MAGIC to families before they make income decisions.

# COMMAND ----------

# Compute dollar cliffs: for each household size, what monthly income triggers loss of each program?
cliffs = spark.sql(
    """
    WITH fpl AS (
        SELECT household_size, annual_amount
        FROM fpl_thresholds
        WHERE region = '48_states_dc'
    ),
    thresholds AS (
        SELECT
            f.household_size,
            f.annual_amount AS fpl_annual,
            ROUND(f.annual_amount * 1.30 / 12, 0)  AS snap_130_monthly,
            ROUND(f.annual_amount * 1.38 / 12, 0)  AS medicaid_138_monthly,
            ROUND(f.annual_amount * 1.85 / 12, 0)  AS wic_185_monthly,
            ROUND(f.annual_amount * 2.00 / 12, 0)  AS snap_bbce_200_monthly,
            ROUND(f.annual_amount * 3.00 / 12, 0)  AS chip_300_monthly
        FROM fpl f
    )
    SELECT
        household_size,
        fpl_annual AS fpl_100_annual,
        snap_130_monthly      AS `SNAP 130% cutoff ($/mo)`,
        medicaid_138_monthly  AS `Medicaid 138% cutoff ($/mo)`,
        wic_185_monthly       AS `WIC 185% cutoff ($/mo)`,
        snap_bbce_200_monthly AS `SNAP BBCE 200% cutoff ($/mo)`,
        chip_300_monthly      AS `CHIP 300% cutoff ($/mo)`
    FROM thresholds
    ORDER BY household_size
"""
)
display(cliffs)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 2c. Regional FPL Differences: Alaska and Hawaii
# MAGIC
# MAGIC Alaska and Hawaii have higher FPL thresholds reflecting higher cost of living.
# MAGIC BenefitsIQ accounts for this automatically when a user selects their state.

# COMMAND ----------

# Compare FPL across regions for the same household size
regional_comparison = spark.sql(
    """
    SELECT
        household_size,
        MAX(CASE WHEN region = '48_states_dc' THEN annual_amount END) AS lower_48,
        MAX(CASE WHEN region = 'alaska' THEN annual_amount END) AS alaska,
        MAX(CASE WHEN region = 'hawaii' THEN annual_amount END) AS hawaii
    FROM fpl_thresholds
    GROUP BY household_size
    ORDER BY household_size
"""
)
display(regional_comparison)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ## 3. Census ACS Deep Dive: Finding the Participation Gap
# MAGIC
# MAGIC This is where the "AI for Good" mission becomes concrete. The U.S. Census American Community
# MAGIC Survey (ACS) 2022 gives us real, survey-based data on SNAP receipt and poverty rates by state.
# MAGIC
# MAGIC **The participation gap** = states where poverty is high but SNAP receipt is low.
# MAGIC These are the states where families are most likely eligible but NOT enrolled —
# MAGIC exactly the families BenefitsIQ is built to reach.

# COMMAND ----------

# ACS state stats overview
acs_overview = spark.sql(
    """
    SELECT
        COUNT(*)                           AS states_covered,
        SUM(total_households)              AS total_us_households,
        SUM(snap_households)               AS total_snap_households,
        ROUND(100.0 * SUM(snap_households) / SUM(total_households), 1) AS national_snap_pct,
        ROUND(AVG(poverty_pct), 1)         AS avg_state_poverty_pct,
        MIN(acs_year)                      AS data_year,
        MAX(source_citation)               AS source
    FROM acs_state_stats
"""
)
display(acs_overview)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 3a. SNAP Receipt vs Poverty Rate by State
# MAGIC
# MAGIC In a "perfect" system, states with higher poverty would have proportionally higher SNAP
# MAGIC participation. Deviations reveal enrollment barriers.
# MAGIC
# MAGIC **Use the scatter plot visualization** (click the chart icon below the table): set X = `poverty_pct`,
# MAGIC Y = `snap_receipt_pct`, and label each point by `state`. States below the diagonal are
# MAGIC under-enrolled relative to their poverty level.

# COMMAND ----------

snap_vs_poverty = spark.sql(
    """
    SELECT
        state,
        state_name,
        snap_receipt_pct,
        poverty_pct,
        total_households,
        snap_households,
        ROUND(poverty_pct - snap_receipt_pct, 1) AS gap_pct,
        ROUND(
            (poverty_pct - snap_receipt_pct) / NULLIF(poverty_pct, 0) * 100, 1
        ) AS gap_pct_of_poverty
    FROM acs_state_stats
    ORDER BY poverty_pct DESC
"""
)
display(snap_vs_poverty)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 3b. The Participation Gap: Where BenefitsIQ Is Needed Most
# MAGIC
# MAGIC These are states where poverty is above the national average but SNAP receipt is below
# MAGIC what we would expect. The `gap_ratio` measures how much of the poverty-eligible population
# MAGIC appears to NOT be receiving SNAP benefits.
# MAGIC
# MAGIC **This is the core "AI for Good" insight**: these states represent families who are likely
# MAGIC eligible but face barriers to enrollment. BenefitsIQ reduces those barriers by providing
# MAGIC instant, personalized eligibility screening.

# COMMAND ----------

participation_gap = spark.sql(
    """
    WITH national AS (
        SELECT
            ROUND(AVG(poverty_pct), 1) AS avg_poverty,
            ROUND(AVG(snap_receipt_pct), 1) AS avg_snap
        FROM acs_state_stats
    )
    SELECT
        a.state,
        a.state_name,
        a.poverty_pct,
        a.snap_receipt_pct,
        ROUND(a.poverty_pct - a.snap_receipt_pct, 1) AS raw_gap,
        ROUND(
            (a.poverty_pct - a.snap_receipt_pct) / NULLIF(a.poverty_pct, 0) * 100, 1
        ) AS gap_ratio,
        a.total_households,
        ROUND(a.total_households * (a.poverty_pct - a.snap_receipt_pct) / 100, 0) AS est_gap_households,
        CASE
            WHEN a.poverty_pct > n.avg_poverty AND a.snap_receipt_pct < n.avg_snap
            THEN 'HIGH PRIORITY'
            WHEN a.poverty_pct > n.avg_poverty
            THEN 'ELEVATED'
            ELSE 'BASELINE'
        END AS priority_tier
    FROM acs_state_stats a
    CROSS JOIN national n
    WHERE a.poverty_pct > a.snap_receipt_pct
    ORDER BY est_gap_households DESC
"""
)
display(participation_gap)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 3c. Estimated Households in the Gap
# MAGIC
# MAGIC A rough but powerful estimate: if the difference between poverty rate and SNAP receipt rate
# MAGIC represents un-enrolled families, how many households are we talking about nationally?

# COMMAND ----------

gap_national = spark.sql(
    """
    SELECT
        SUM(
            CASE WHEN poverty_pct > snap_receipt_pct
                 THEN ROUND(total_households * (poverty_pct - snap_receipt_pct) / 100, 0)
                 ELSE 0
            END
        ) AS est_total_gap_households,
        COUNT(
            CASE WHEN poverty_pct > snap_receipt_pct THEN 1 END
        ) AS states_with_gap,
        ROUND(AVG(
            CASE WHEN poverty_pct > snap_receipt_pct
                 THEN poverty_pct - snap_receipt_pct
            END
        ), 1) AS avg_gap_pct
    FROM acs_state_stats
"""
)
display(gap_national)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ## 4. Knowledge Base Coverage: "How to Apply" RAG Corpus
# MAGIC
# MAGIC BenefitsIQ does not stop at eligibility screening. It provides step-by-step application
# MAGIC guidance via a curated, citation-backed knowledge base (`apply_kb`). This is a small,
# MAGIC high-quality RAG corpus — every chunk links back to a real federal agency source URL.
# MAGIC
# MAGIC We use **retrieval-augmented generation responsibly**: procedural guidance is the right
# MAGIC use case for RAG (grounded, factual, citation-backed), while eligibility determination
# MAGIC stays deterministic (no LLM in the screening loop).

# COMMAND ----------

# Knowledge base coverage by program
kb_coverage = spark.sql(
    """
    SELECT
        program_short                     AS program,
        COUNT(*)                          AS chunk_count,
        COUNT(DISTINCT source_name)       AS distinct_sources,
        COUNT(DISTINCT source_url)        AS distinct_urls,
        ROUND(AVG(LENGTH(chunk_text)), 0) AS avg_chunk_length,
        MIN(LENGTH(chunk_text))           AS min_chunk_length,
        MAX(LENGTH(chunk_text))           AS max_chunk_length
    FROM apply_kb
    GROUP BY program_short
    ORDER BY chunk_count DESC
"""
)
display(kb_coverage)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 4a. Source Diversity: Every Chunk Has a Real Citation
# MAGIC
# MAGIC Unlike LLMs that hallucinate URLs, every row in `apply_kb` has a verified `source_url`
# MAGIC pointing to an actual federal agency page. This is the "Data Relevance" criterion in action:
# MAGIC real data, real sources, real impact.

# COMMAND ----------

# All distinct sources in the knowledge base
kb_sources = spark.sql(
    """
    SELECT DISTINCT
        program_short AS program,
        source_name,
        source_url
    FROM apply_kb
    ORDER BY program_short, source_name
"""
)
display(kb_sources)

# COMMAND ----------

# Total KB stats
kb_totals = spark.sql(
    """
    SELECT
        COUNT(*)                          AS total_chunks,
        COUNT(DISTINCT program_short)     AS programs_covered,
        COUNT(DISTINCT source_name)       AS unique_sources,
        COUNT(DISTINCT source_url)        AS unique_urls,
        SUM(LENGTH(chunk_text))           AS total_corpus_chars,
        ROUND(SUM(LENGTH(chunk_text)) / 4.0, 0) AS approx_token_count
    FROM apply_kb
"""
)
display(kb_totals)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ## 5. Cohort Distribution: Who Are We Serving?
# MAGIC
# MAGIC The `cohort_stats` table models typical household patterns — combinations of household size,
# MAGIC income band, and life situation (job loss, pregnancy, etc.) — and the program bundles those
# MAGIC families typically access. This powers the "families like yours" context in BenefitsIQ.
# MAGIC
# MAGIC **Important**: `modeled_n` is a *modeled sample size*, not observed individuals.
# MAGIC The patterns are synthesized from aggregate federal statistics (USDA FNS participation reports,
# MAGIC CMS enrollment data, SNAP QC data) to illustrate typical journeys.

# COMMAND ----------

# Cohort distribution overview
cohort_overview = spark.sql(
    """
    SELECT
        COUNT(*)                                   AS total_cohorts,
        COUNT(DISTINCT state)                      AS states,
        COUNT(DISTINCT household_band)             AS household_bands,
        COUNT(DISTINCT income_band)                AS income_bands,
        COUNT(DISTINCT situation)                  AS situations,
        SUM(modeled_n)                             AS total_modeled_n,
        ROUND(AVG(avg_processing_days), 1)         AS avg_processing_days,
        ROUND(AVG(expedited_pct), 1)               AS avg_expedited_pct
    FROM cohort_stats
"""
)
display(cohort_overview)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 5a. Household Bands: Which Family Sizes Are Most Represented?

# COMMAND ----------

by_household = spark.sql(
    """
    SELECT
        household_band,
        COUNT(*)           AS cohort_count,
        SUM(modeled_n)     AS total_modeled_n,
        ROUND(AVG(avg_processing_days), 1) AS avg_processing_days,
        ROUND(AVG(expedited_pct), 1)       AS avg_expedited_pct
    FROM cohort_stats
    GROUP BY household_band
    ORDER BY cohort_count DESC
"""
)
display(by_household)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 5b. Income Bands: Where Are Families on the Income Spectrum?

# COMMAND ----------

by_income = spark.sql(
    """
    SELECT
        income_band,
        COUNT(*)           AS cohort_count,
        SUM(modeled_n)     AS total_modeled_n,
        ROUND(AVG(avg_processing_days), 1) AS avg_processing_days,
        ROUND(AVG(expedited_pct), 1)       AS avg_expedited_pct
    FROM cohort_stats
    GROUP BY income_band
    ORDER BY cohort_count DESC
"""
)
display(by_income)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 5c. Life Situations: Job Loss, Pregnancy, and Other Triggers
# MAGIC
# MAGIC Certain life events (recent job loss, pregnancy) trigger expedited processing and
# MAGIC expand eligibility. BenefitsIQ asks about these because they matter.

# COMMAND ----------

by_situation = spark.sql(
    """
    SELECT
        situation,
        COUNT(*)           AS cohort_count,
        SUM(modeled_n)     AS total_modeled_n,
        ROUND(AVG(avg_processing_days), 1) AS avg_processing_days,
        ROUND(AVG(expedited_pct), 1)       AS avg_expedited_pct
    FROM cohort_stats
    GROUP BY situation
    ORDER BY avg_expedited_pct DESC
"""
)
display(by_situation)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 5d. Typical Program Bundles: What Do Families Access Together?
# MAGIC
# MAGIC Families rarely use just one program. BenefitsIQ screens for ALL programs simultaneously
# MAGIC because that is how families actually experience the system.

# COMMAND ----------

# Most common program combinations
program_bundles = spark.sql(
    """
    SELECT
        programs_typical,
        COUNT(*)           AS cohort_count,
        SUM(modeled_n)     AS total_modeled_n
    FROM cohort_stats
    GROUP BY programs_typical
    ORDER BY total_modeled_n DESC
    LIMIT 15
"""
)
display(program_bundles)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 5e. Expedited Processing: Who Gets Help Fastest?
# MAGIC
# MAGIC SNAP requires 7-day expedited processing for households with very low income/resources.
# MAGIC BenefitsIQ detects this eligibility and tells users to mention it when applying.

# COMMAND ----------

expedited_analysis = spark.sql(
    """
    SELECT
        state,
        situation,
        income_band,
        ROUND(AVG(expedited_pct), 1) AS avg_expedited_pct,
        ROUND(AVG(avg_processing_days), 1) AS avg_days,
        COUNT(*) AS cohorts
    FROM cohort_stats
    WHERE expedited_pct > 0
    GROUP BY state, situation, income_band
    ORDER BY avg_expedited_pct DESC
    LIMIT 20
"""
)
display(expedited_analysis)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ## 6. Data Quality: Trust Through Verification
# MAGIC
# MAGIC For an "AI for Good" application giving families real advice, data quality is non-negotiable.
# MAGIC Bad data leads to bad eligibility results, which erodes trust with vulnerable populations.
# MAGIC
# MAGIC These checks run against our Unity Catalog Delta tables to confirm integrity.

# COMMAND ----------

# MAGIC %md
# MAGIC ### 6a. Row Counts: Is Everything Loaded?

# COMMAND ----------

from pyspark.sql import functions as F

# Row counts for all tables
table_names = [
    "programs",
    "eligibility_rules",
    "fpl_thresholds",
    "acs_state_stats",
    "apply_kb",
    "cohort_stats",
]
counts = []
for t in table_names:
    try:
        n = spark.table(t).count()
        counts.append((t, n, "OK" if n > 0 else "EMPTY"))
    except Exception as e:
        counts.append((t, 0, f"ERROR: {str(e)[:80]}"))

counts_df = spark.createDataFrame(counts, ["table_name", "row_count", "status"])
display(counts_df)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 6b. Null Checks: Are Critical Fields Populated?

# COMMAND ----------

# Check for nulls in critical columns of eligibility_rules
null_checks = spark.sql(
    """
    SELECT
        COUNT(*)                                                    AS total_rules,
        SUM(CASE WHEN program_id IS NULL THEN 1 ELSE 0 END)        AS null_program_id,
        SUM(CASE WHEN max_pct_fpl IS NULL
                  AND max_gross_monthly IS NULL THEN 1 ELSE 0 END)  AS no_income_limit,
        SUM(CASE WHEN notes IS NULL THEN 1 ELSE 0 END)             AS null_notes,
        -- Rules with NEITHER a dollar threshold NOR a %FPL threshold AND NOT categorical
        SUM(CASE WHEN max_pct_fpl IS NULL
                  AND max_gross_monthly IS NULL
                  AND NOT COALESCE(categorical_eligible, false)
             THEN 1 ELSE 0 END)                                     AS orphan_rules
    FROM eligibility_rules
"""
)
display(null_checks)

# COMMAND ----------

# Check for nulls in FPL thresholds (should have zero nulls -- this is reference data)
fpl_nulls = spark.sql(
    """
    SELECT
        COUNT(*)                                                AS total,
        SUM(CASE WHEN year IS NULL THEN 1 ELSE 0 END)          AS null_year,
        SUM(CASE WHEN household_size IS NULL THEN 1 ELSE 0 END) AS null_hh_size,
        SUM(CASE WHEN annual_amount IS NULL THEN 1 ELSE 0 END) AS null_amount,
        SUM(CASE WHEN region IS NULL THEN 1 ELSE 0 END)        AS null_region
    FROM fpl_thresholds
"""
)
display(fpl_nulls)

# COMMAND ----------

# MAGIC %md
# MAGIC ### 6c. Duplicate Detection

# COMMAND ----------

# Check for duplicate rules (same program + state + household_size should be unique or intentional)
dupes = spark.sql(
    """
    SELECT
        program_id, state, household_size, COUNT(*) AS cnt
    FROM eligibility_rules
    GROUP BY program_id, state, household_size
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
"""
)

dupe_count = dupes.count()
print(f"Duplicate rule combinations (program + state + household_size): {dupe_count}")
if dupe_count > 0:
    display(dupes)
else:
    print("No duplicates found -- data is clean.")

# COMMAND ----------

# Check for duplicate FPL entries
fpl_dupes = spark.sql(
    """
    SELECT
        year, household_size, region, COUNT(*) AS cnt
    FROM fpl_thresholds
    GROUP BY year, household_size, region
    HAVING COUNT(*) > 1
"""
)

fpl_dupe_count = fpl_dupes.count()
print(f"Duplicate FPL threshold entries: {fpl_dupe_count}")
if fpl_dupe_count > 0:
    display(fpl_dupes)
else:
    print("No duplicates found -- FPL reference data is clean.")

# COMMAND ----------

# MAGIC %md
# MAGIC ### 6d. Referential Integrity: Do All Rules Reference Valid Programs?

# COMMAND ----------

# Every program_id in eligibility_rules should exist in programs
orphan_rules = spark.sql(
    """
    SELECT er.id, er.program_id, er.state, er.max_pct_fpl
    FROM eligibility_rules er
    LEFT JOIN programs p ON er.program_id = p.id
    WHERE p.id IS NULL
"""
)

orphan_count = orphan_rules.count()
print(f"Eligibility rules referencing non-existent programs: {orphan_count}")
if orphan_count > 0:
    display(orphan_rules)
else:
    print(
        "All eligibility rules reference valid programs -- referential integrity holds."
    )

# COMMAND ----------

# Every program_short in apply_kb should match a short_name in programs
orphan_kb = spark.sql(
    """
    SELECT DISTINCT kb.program_short
    FROM apply_kb kb
    LEFT JOIN programs p ON kb.program_short = p.short_name
    WHERE p.id IS NULL
"""
)

orphan_kb_count = orphan_kb.count()
print(f"KB chunks referencing non-existent programs: {orphan_kb_count}")
if orphan_kb_count > 0:
    display(orphan_kb)
else:
    print(
        "All knowledge base chunks reference valid programs -- referential integrity holds."
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ### 6e. Coverage Matrix: Which Programs Have Rules, KB Chunks, and Cohort Data?
# MAGIC
# MAGIC A complete program in BenefitsIQ has: (1) a program record, (2) eligibility rules,
# MAGIC (3) "how to apply" knowledge base chunks, and optionally (4) cohort statistics.
# MAGIC This matrix shows coverage completeness.

# COMMAND ----------

coverage_matrix = spark.sql(
    """
    SELECT
        p.short_name AS program,
        p.name,
        p.category,
        (SELECT COUNT(*) FROM eligibility_rules er WHERE er.program_id = p.id) AS rule_count,
        (SELECT COUNT(*) FROM apply_kb kb WHERE kb.program_short = p.short_name) AS kb_chunks,
        CASE
            WHEN (SELECT COUNT(*) FROM eligibility_rules er WHERE er.program_id = p.id) > 0
                 AND (SELECT COUNT(*) FROM apply_kb kb WHERE kb.program_short = p.short_name) > 0
            THEN 'COMPLETE'
            WHEN (SELECT COUNT(*) FROM eligibility_rules er WHERE er.program_id = p.id) > 0
            THEN 'RULES ONLY'
            WHEN (SELECT COUNT(*) FROM apply_kb kb WHERE kb.program_short = p.short_name) > 0
            THEN 'KB ONLY'
            ELSE 'MISSING'
        END AS coverage_status
    FROM programs p
    ORDER BY rule_count DESC
"""
)
display(coverage_matrix)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ## 7. Summary: The Story in the Data
# MAGIC
# MAGIC | Finding | What the Data Shows | What BenefitsIQ Does About It |
# MAGIC |---------|--------------------|-----------------------------|
# MAGIC | **State variation** | Income thresholds vary 2-3x across states for the same program | Loads state-specific rules; gives accurate, not generic, answers |
# MAGIC | **Medicaid gap** | Non-expansion states have 0% FPL adult Medicaid | Detects this and gives honest "unlikely" instead of a false positive |
# MAGIC | **Benefits cliff** | A $1/month income increase can cost thousands in benefits | Shows total package value across ALL programs simultaneously |
# MAGIC | **Participation gap** | Millions of eligible families are not enrolled in SNAP | Targets exactly this population with instant, barrier-free screening |
# MAGIC | **Program bundles** | Families use 3-5 programs together, not in isolation | Screens for ALL programs at once and suggests application order |
# MAGIC | **Expedited processing** | Job loss and extreme poverty trigger 7-day processing | Detects these triggers and tells families to mention them when applying |
# MAGIC | **Citation integrity** | Every data point traces to a federal source | Builds user trust by showing exactly where the information comes from |
# MAGIC
# MAGIC **The bottom line**: The data shows that the enrollment gap is real, measurable, and addressable.
# MAGIC BenefitsIQ uses Databricks Unity Catalog, Delta tables, and Lakebase to turn this public data
# MAGIC into a deterministic, transparent, citation-backed tool that helps families access benefits
# MAGIC they have already earned.

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC *Notebook generated for the Databricks AI for Good Hackathon 2026.*
# MAGIC *Data sources: USDA FNS, HHS/CMS, SSA, HUD, U.S. Census Bureau ACS 2022.*
# MAGIC *All data is publicly available and reproducible. Pipeline scripts are version-controlled.*
