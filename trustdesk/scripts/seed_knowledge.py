"""
Seed the clinical specialty-equipment knowledge map as a Delta table.

This is CURATED DATA — defined in-script, not loaded from a file.
Powers the "Claims vs Evidence" dimension of the trust engine:
does a facility actually have the equipment/procedures/staffing
required to deliver the specialties it claims?

Target: trustdesk.app.clinical_knowledge (Delta, CDF enabled)

Runs as a Databricks Spark job task.
"""

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    ArrayType,
    IntegerType,
    StringType,
    StructField,
    StructType,
)

CATALOG = "databricks_virtue_foundation_dataset_dais_2026"
SCHEMA = "app"
TABLE = f"{CATALOG}.{SCHEMA}.clinical_knowledge"

spark = SparkSession.builder.getOrCreate()

# ── 1. Ensure catalog and schema exist ──────────────────────────────────────

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

# ── 2. Define the knowledge map ────────────────────────────────────────────
# (specialty, required_equipment, required_procedures, min_doctors)

knowledge = [
    (
        "cardiology",
        ["ECG", "Echo", "Defibrillator", "Holter Monitor", "Stress Test Equipment"],
        ["Angiography", "Angioplasty", "Pacemaker Implantation", "CABG"],
        2,
    ),
    (
        "radiology",
        ["X-ray", "CT Scanner", "MRI", "Ultrasound", "Mammography Unit"],
        [
            "CT Scan",
            "MRI Scan",
            "Mammography",
            "Fluoroscopy",
            "Interventional Radiology",
        ],
        1,
    ),
    (
        "orthopedics",
        ["X-ray", "C-Arm", "Arthroscope", "Bone Densitometer"],
        ["Joint Replacement", "Fracture Fixation", "Arthroscopy", "Spine Surgery"],
        2,
    ),
    (
        "pediatrics",
        ["Incubator", "Phototherapy Unit", "Pediatric Ventilator", "Pulse Oximeter"],
        ["Neonatal Resuscitation", "Pediatric Surgery", "Vaccination"],
        2,
    ),
    (
        "general_surgery",
        [
            "OT Table",
            "Anesthesia Machine",
            "Electrocautery",
            "Laparoscope",
            "Suction Machine",
        ],
        ["Appendectomy", "Hernia Repair", "Cholecystectomy", "Laparoscopic Surgery"],
        2,
    ),
    (
        "oncology",
        ["Linear Accelerator", "CT Simulator", "Chemotherapy Infusion Pump", "PET-CT"],
        ["Chemotherapy", "Radiation Therapy", "Biopsy", "Tumor Excision"],
        2,
    ),
    (
        "neurology",
        ["EEG", "EMG", "CT Scanner", "MRI"],
        ["Lumbar Puncture", "Nerve Conduction Study", "EEG Monitoring", "Thrombolysis"],
        2,
    ),
    (
        "nephrology",
        ["Dialysis Machine", "Ultrasound", "ABG Analyzer"],
        ["Hemodialysis", "Peritoneal Dialysis", "Kidney Biopsy", "AV Fistula Creation"],
        1,
    ),
    (
        "gastroenterology",
        ["Endoscope", "Colonoscope", "Ultrasound", "ERCP Equipment"],
        ["Upper GI Endoscopy", "Colonoscopy", "ERCP", "Liver Biopsy", "Polypectomy"],
        1,
    ),
    (
        "dermatology",
        ["Dermatoscope", "Cryotherapy Unit", "Electrocautery", "UV Therapy Unit"],
        ["Skin Biopsy", "Cryotherapy", "Electrosurgery", "Phototherapy"],
        1,
    ),
    (
        "ent",
        ["Otoscope", "Audiometer", "Endoscope", "Microscope"],
        ["Tonsillectomy", "Septoplasty", "Myringotomy", "FESS", "Audiometry"],
        1,
    ),
    (
        "ophthalmology",
        ["Slit Lamp", "Fundoscope", "Tonometer", "Phaco Machine", "OCT"],
        ["Cataract Surgery", "Glaucoma Surgery", "Retinal Laser", "LASIK"],
        1,
    ),
    (
        "gynecology",
        ["Ultrasound", "Colposcope", "CTG Machine", "Laparoscope"],
        ["Cesarean Section", "Hysterectomy", "D&C", "Laparoscopic Surgery", "IVF"],
        2,
    ),
    (
        "urology",
        ["Cystoscope", "Ultrasound", "Lithotripter", "Urodynamics Equipment"],
        ["Cystoscopy", "TURP", "Lithotripsy", "Nephrectomy"],
        1,
    ),
    (
        "psychiatry",
        ["ECT Machine"],
        ["Electroconvulsive Therapy", "Psychotherapy", "De-addiction"],
        1,
    ),
    (
        "pulmonology",
        ["Spirometer", "Bronchoscope", "Ventilator", "ABG Analyzer", "Pulse Oximeter"],
        [
            "Bronchoscopy",
            "Pulmonary Function Test",
            "Pleural Tapping",
            "Chest Tube Insertion",
        ],
        1,
    ),
    (
        "endocrinology",
        ["Glucometer", "Ultrasound", "Bone Densitometer", "HbA1c Analyzer"],
        ["Thyroid Biopsy", "Insulin Pump Management", "Diabetes Management"],
        1,
    ),
    (
        "critical_care",
        [
            "Ventilator",
            "Multi-Para Monitor",
            "Defibrillator",
            "ABG Analyzer",
            "Infusion Pump",
            "Central Line Kit",
        ],
        ["Mechanical Ventilation", "Central Line Insertion", "Intubation", "CPR"],
        3,
    ),
    (
        "emergency",
        [
            "Defibrillator",
            "Ventilator",
            "Multi-Para Monitor",
            "Pulse Oximeter",
            "Suction Machine",
            "Trauma Kit",
        ],
        [
            "Trauma Stabilization",
            "CPR",
            "Intubation",
            "Wound Suturing",
            "Fracture Splinting",
        ],
        2,
    ),
    (
        "dental",
        ["Dental Chair", "Dental X-ray", "Autoclave", "Ultrasonic Scaler"],
        ["Extraction", "Root Canal", "Dental Implant", "Orthodontics", "Scaling"],
        1,
    ),
    (
        "physiotherapy",
        [
            "Ultrasound Therapy",
            "TENS",
            "Traction Unit",
            "Exercise Equipment",
            "Wax Bath",
        ],
        [
            "Physiotherapy Assessment",
            "Electrotherapy",
            "Manual Therapy",
            "Rehabilitation",
        ],
        1,
    ),
    (
        "pathology",
        [
            "Microscope",
            "Hematology Analyzer",
            "Biochemistry Analyzer",
            "Blood Bank Refrigerator",
        ],
        [
            "CBC",
            "Blood Typing",
            "Histopathology",
            "Culture & Sensitivity",
            "Urinalysis",
        ],
        1,
    ),
]

# ── 3. Create DataFrame ────────────────────────────────────────────────────

schema = StructType(
    [
        StructField("specialty", StringType(), False),
        StructField("required_equipment", ArrayType(StringType()), False),
        StructField("required_procedures", ArrayType(StringType()), False),
        StructField("min_doctors", IntegerType(), False),
    ]
)

df = spark.createDataFrame(knowledge, schema)

print(f"Clinical knowledge map: {df.count()} specialties")
df.show(truncate=False)

# ── 4. Write Delta ─────────────────────────────────────────────────────────

print(f"Writing to {TABLE} ...")
df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").option(
    "delta.enableChangeDataFeed", "true"
).saveAsTable(TABLE)

final_count = spark.table(TABLE).count()
print(f"Loaded {final_count} specialty knowledge records into {TABLE}")
