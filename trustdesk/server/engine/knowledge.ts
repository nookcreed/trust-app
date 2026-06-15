/**
 * Clinical knowledge maps — curated reference data for trust scoring.
 *
 * Maps specialties to the equipment and procedures a facility SHOULD have
 * if it legitimately offers that specialty. This is the backbone of the
 * "Claims vs Evidence" dimension.
 *
 * Pure data — no I/O, no side effects.
 */

// ---------------------------------------------------------------------------
// Specialty requirements
// ---------------------------------------------------------------------------

export interface SpecialtyRequirement {
  /** Equipment items the specialty typically requires */
  equipment: string[];
  /** Procedures the specialty typically performs */
  procedures: string[];
  /** Minimum doctors needed to credibly offer this specialty */
  min_doctors?: number;
}

/**
 * At least one equipment OR procedure match per specialty is expected.
 * A specialty with ZERO matches is a critical red-flag.
 */
export const SPECIALTY_REQUIREMENTS: Record<string, SpecialtyRequirement> = {
  cardiology: {
    equipment: [
      'ECG',
      'Echo',
      'Echocardiography',
      'Defibrillator',
      'Holter Monitor',
      'Treadmill Test',
      'TMT',
      'Cardiac Monitor',
      'Cath Lab',
      'Pacemaker Programmer',
    ],
    procedures: [
      'Angiography',
      'Angioplasty',
      'Pacemaker Implantation',
      'Pacemaker',
      'CABG',
      'Cardiac Catheterization',
      'Stent Placement',
      'Electrophysiology Study',
      'Stress Test',
    ],
    min_doctors: 1,
  },
  radiology: {
    equipment: [
      'X-ray',
      'X-Ray',
      'CT Scanner',
      'CT Scan',
      'MRI',
      'MRI Scanner',
      'Ultrasound',
      'USG',
      'Mammography',
      'Fluoroscopy',
      'C-arm',
      'DEXA',
    ],
    procedures: [
      'CT Scan',
      'MRI Scan',
      'Mammography',
      'Ultrasound',
      'USG',
      'X-Ray',
      'Barium Study',
      'Fluoroscopy',
      'Interventional Radiology',
    ],
    min_doctors: 1,
  },
  orthopedics: {
    equipment: [
      'C-arm',
      'C-Arm',
      'Bone Densitometer',
      'DEXA',
      'Arthroscopy Set',
      'Traction Table',
      'Plaster Room',
      'Power Drill',
      'Image Intensifier',
    ],
    procedures: [
      'Joint Replacement',
      'Knee Replacement',
      'Hip Replacement',
      'Arthroscopy',
      'Fracture Fixation',
      'Spine Surgery',
      'Ligament Reconstruction',
      'Bone Grafting',
      'ORIF',
    ],
    min_doctors: 1,
  },
  pediatrics: {
    equipment: [
      'Nebulizer',
      'Infant Warmer',
      'Phototherapy Unit',
      'Pulse Oximeter',
      'Pediatric Ventilator',
      'Incubator',
      'Baby Weighing Scale',
      'NICU',
    ],
    procedures: [
      'Vaccination',
      'Immunization',
      'Neonatal Care',
      'Newborn Screening',
      'Growth Monitoring',
      'Pediatric Surgery',
    ],
    min_doctors: 1,
  },
  'general surgery': {
    equipment: [
      'Operation Theater',
      'Operation Theatre',
      'OT',
      'Anesthesia Machine',
      'Cautery Machine',
      'Electrocautery',
      'Autoclave',
      'Suction Machine',
      'Laparoscope',
      'Surgical Lights',
      'Boyle Apparatus',
    ],
    procedures: [
      'Laparoscopy',
      'Appendectomy',
      'Hernia Repair',
      'Cholecystectomy',
      'Circumcision',
      'Abscess Drainage',
      'Wound Debridement',
      'Hydrocele Surgery',
    ],
    min_doctors: 1,
  },
  surgery: {
    equipment: [
      'Operation Theater',
      'Operation Theatre',
      'OT',
      'Anesthesia Machine',
      'Cautery Machine',
      'Electrocautery',
      'Autoclave',
      'Suction Machine',
      'Laparoscope',
    ],
    procedures: [
      'Laparoscopy',
      'Appendectomy',
      'Hernia Repair',
      'Cholecystectomy',
      'General Surgery',
    ],
    min_doctors: 1,
  },
  oncology: {
    equipment: [
      'Linear Accelerator',
      'LINAC',
      'Cobalt-60',
      'Brachytherapy',
      'PET-CT',
      'PET Scanner',
      'Chemotherapy Chair',
      'Bone Marrow Biopsy Set',
    ],
    procedures: [
      'Chemotherapy',
      'Radiation Therapy',
      'Radiotherapy',
      'Tumor Excision',
      'Bone Marrow Transplant',
      'Brachytherapy',
      'Immunotherapy',
    ],
    min_doctors: 1,
  },
  neurology: {
    equipment: [
      'EEG',
      'EMG',
      'NCV',
      'CT Scanner',
      'MRI',
      'Nerve Conduction',
      'Doppler Ultrasound',
    ],
    procedures: [
      'EEG',
      'EMG',
      'Nerve Conduction Study',
      'Lumbar Puncture',
      'Stroke Management',
      'Epilepsy Management',
      'Botox Injection',
    ],
    min_doctors: 1,
  },
  neurosurgery: {
    equipment: [
      'Operating Microscope',
      'Neuronavigation',
      'CT Scanner',
      'MRI',
      'Craniotomy Set',
      'High-Speed Drill',
      'C-arm',
    ],
    procedures: [
      'Craniotomy',
      'Spine Surgery',
      'VP Shunt',
      'Brain Tumor Surgery',
      'Disc Surgery',
      'Laminectomy',
    ],
    min_doctors: 1,
  },
  nephrology: {
    equipment: [
      'Dialysis Machine',
      'Hemodialysis',
      'Peritoneal Dialysis',
      'RO Plant',
      'Water Treatment',
      'Fistula Needle',
    ],
    procedures: [
      'Hemodialysis',
      'Peritoneal Dialysis',
      'Kidney Biopsy',
      'Renal Transplant',
      'AV Fistula',
      'CAPD',
    ],
    min_doctors: 1,
  },
  gastroenterology: {
    equipment: [
      'Endoscope',
      'Colonoscope',
      'Upper GI Endoscope',
      'ERCP',
      'Ultrasound',
      'Fibroscan',
    ],
    procedures: [
      'Endoscopy',
      'Colonoscopy',
      'ERCP',
      'Polypectomy',
      'Liver Biopsy',
      'Variceal Banding',
      'PEG Insertion',
    ],
    min_doctors: 1,
  },
  dermatology: {
    equipment: [
      'Dermatoscope',
      'Cryotherapy',
      'Electrocautery',
      'Laser',
      'Wood Lamp',
      'UV Phototherapy',
    ],
    procedures: [
      'Skin Biopsy',
      'Cryotherapy',
      'Laser Treatment',
      'Excision',
      'Chemical Peel',
      'Phototherapy',
    ],
    min_doctors: 1,
  },
  ent: {
    equipment: [
      'Otoscope',
      'Audiometer',
      'Endoscope',
      'Nasal Endoscope',
      'Microscope',
      'Tympanometer',
      'Hearing Aid',
    ],
    procedures: [
      'Tonsillectomy',
      'Adenoidectomy',
      'Septoplasty',
      'Myringotomy',
      'FESS',
      'Mastoidectomy',
      'Hearing Test',
      'Audiometry',
    ],
    min_doctors: 1,
  },
  ophthalmology: {
    equipment: [
      'Slit Lamp',
      'Tonometer',
      'Auto Refractometer',
      'Fundus Camera',
      'OCT',
      'Phaco Machine',
      'Keratometer',
      'A-scan',
      'B-scan',
      'Perimeter',
      'YAG Laser',
    ],
    procedures: [
      'Cataract Surgery',
      'Phacoemulsification',
      'Glaucoma Surgery',
      'Retinal Laser',
      'LASIK',
      'Pterygium Excision',
      'Squint Surgery',
      'Vitrectomy',
    ],
    min_doctors: 1,
  },
  gynecology: {
    equipment: [
      'Ultrasound',
      'USG',
      'Colposcope',
      'Fetal Monitor',
      'CTG Machine',
      'Hysteroscope',
      'Laparoscope',
      'Infant Warmer',
    ],
    procedures: [
      'Cesarean Section',
      'C-Section',
      'Hysterectomy',
      'D&C',
      'Laparoscopic Surgery',
      'IVF',
      'Tubal Ligation',
      'Normal Delivery',
      'Hysteroscopy',
    ],
    min_doctors: 1,
  },
  obstetrics: {
    equipment: [
      'Ultrasound',
      'USG',
      'Fetal Monitor',
      'CTG Machine',
      'Infant Warmer',
      'Delivery Table',
      'Phototherapy Unit',
      'Incubator',
    ],
    procedures: [
      'Normal Delivery',
      'Cesarean Section',
      'C-Section',
      'Episiotomy',
      'Vacuum Extraction',
      'Antenatal Care',
      'Postnatal Care',
    ],
    min_doctors: 1,
  },
  urology: {
    equipment: [
      'Cystoscope',
      'Urodynamic Machine',
      'Lithotripter',
      'ESWL',
      'Ultrasound',
      'Laser',
    ],
    procedures: [
      'Cystoscopy',
      'TURP',
      'Lithotripsy',
      'ESWL',
      'Ureteral Stent',
      'Nephrectomy',
      'Prostate Biopsy',
      'Circumcision',
    ],
    min_doctors: 1,
  },
  psychiatry: {
    equipment: ['ECT Machine', 'EEG', 'Counseling Room', 'Seclusion Room'],
    procedures: [
      'ECT',
      'Counseling',
      'Psychotherapy',
      'CBT',
      'De-addiction',
      'Rehabilitation',
    ],
    min_doctors: 1,
  },
  pulmonology: {
    equipment: [
      'Spirometer',
      'Bronchoscope',
      'Ventilator',
      'CPAP',
      'BiPAP',
      'Nebulizer',
      'Pulse Oximeter',
      'ABG Machine',
      'Chest Drainage Set',
    ],
    procedures: [
      'Bronchoscopy',
      'Spirometry',
      'Thoracentesis',
      'Chest Tube Insertion',
      'Pulmonary Function Test',
      'PFT',
      'Sleep Study',
    ],
    min_doctors: 1,
  },
  endocrinology: {
    equipment: [
      'Glucometer',
      'HbA1c Analyzer',
      'Thyroid Function Lab',
      'Insulin Pump',
      'Bone Densitometer',
      'DEXA',
    ],
    procedures: [
      'Thyroid Biopsy',
      'FNAC Thyroid',
      'Insulin Pump Therapy',
      'Diabetes Management',
      'Hormonal Assay',
    ],
    min_doctors: 1,
  },
  'critical care': {
    equipment: [
      'Ventilator',
      'ICU Bed',
      'Cardiac Monitor',
      'Multi-Para Monitor',
      'Infusion Pump',
      'Syringe Pump',
      'Defibrillator',
      'ABG Machine',
      'Central Line Kit',
      'CPAP',
      'BiPAP',
    ],
    procedures: [
      'Mechanical Ventilation',
      'Central Line Insertion',
      'Arterial Line',
      'Intubation',
      'Tracheostomy',
      'Chest Tube',
    ],
    min_doctors: 2,
  },
  icu: {
    equipment: [
      'Ventilator',
      'ICU Bed',
      'Cardiac Monitor',
      'Multi-Para Monitor',
      'Infusion Pump',
      'Syringe Pump',
      'Defibrillator',
      'ABG Machine',
    ],
    procedures: [
      'Mechanical Ventilation',
      'Central Line Insertion',
      'Intubation',
      'Tracheostomy',
    ],
    min_doctors: 2,
  },
  'emergency medicine': {
    equipment: [
      'Defibrillator',
      'Ventilator',
      'Cardiac Monitor',
      'Pulse Oximeter',
      'Suction Machine',
      'Ambu Bag',
      'Crash Cart',
      'Spine Board',
      'Nebulizer',
    ],
    procedures: [
      'CPR',
      'Intubation',
      'Fracture Splinting',
      'Wound Suturing',
      'Poison Management',
      'Trauma Care',
      'Emergency Resuscitation',
    ],
    min_doctors: 1,
  },
  dental: {
    equipment: [
      'Dental Chair',
      'Dental X-ray',
      'RVG',
      'OPG',
      'Autoclave',
      'Scaler',
      'Compressor',
      'Light Cure',
    ],
    procedures: [
      'Root Canal',
      'RCT',
      'Extraction',
      'Scaling',
      'Filling',
      'Crown',
      'Bridge',
      'Implant',
      'Orthodontics',
      'Braces',
    ],
    min_doctors: 1,
  },
  physiotherapy: {
    equipment: [
      'Ultrasound Therapy',
      'TENS',
      'IFT',
      'SWD',
      'Traction Unit',
      'Exercise Bike',
      'Parallel Bars',
      'Wax Bath',
      'Laser Therapy',
    ],
    procedures: [
      'Physiotherapy',
      'Rehabilitation',
      'Post-operative Rehab',
      'Sports Injury Rehab',
      'Stroke Rehab',
      'Manual Therapy',
    ],
    min_doctors: 1,
  },
  pathology: {
    equipment: [
      'Microscope',
      'Hematology Analyzer',
      'Biochemistry Analyzer',
      'Centrifuge',
      'ELISA Reader',
      'Blood Bank Refrigerator',
      'Culture Incubator',
      'ABG Machine',
    ],
    procedures: [
      'Blood Test',
      'CBC',
      'Biopsy',
      'FNAC',
      'Histopathology',
      'Culture Sensitivity',
      'Blood Grouping',
      'Cross Matching',
    ],
    min_doctors: 1,
  },
  laboratory: {
    equipment: [
      'Microscope',
      'Hematology Analyzer',
      'Biochemistry Analyzer',
      'Centrifuge',
      'ELISA Reader',
    ],
    procedures: [
      'Blood Test',
      'CBC',
      'Urine Analysis',
      'Culture Sensitivity',
      'Serology',
    ],
    min_doctors: 1,
  },
  'plastic surgery': {
    equipment: [
      'Operation Theater',
      'Microsurgical Instruments',
      'Dermatome',
      'Laser',
      'Liposuction Machine',
    ],
    procedures: [
      'Skin Grafting',
      'Flap Surgery',
      'Rhinoplasty',
      'Cleft Lip Repair',
      'Burn Management',
      'Liposuction',
      'Hair Transplant',
    ],
    min_doctors: 1,
  },
  'general medicine': {
    equipment: [
      'Stethoscope',
      'BP Apparatus',
      'Thermometer',
      'Pulse Oximeter',
      'Glucometer',
      'ECG',
      'Nebulizer',
    ],
    procedures: [
      'General Consultation',
      'Health Checkup',
      'Vaccination',
      'Chronic Disease Management',
    ],
    min_doctors: 1,
  },
  anesthesiology: {
    equipment: [
      'Anesthesia Machine',
      'Boyle Apparatus',
      'Ventilator',
      'Laryngoscope',
      'Pulse Oximeter',
      'Capnograph',
      'Infusion Pump',
      'Syringe Pump',
    ],
    procedures: [
      'General Anesthesia',
      'Spinal Anesthesia',
      'Epidural',
      'Regional Block',
      'Pain Management',
      'Sedation',
    ],
    min_doctors: 1,
  },
};

// ---------------------------------------------------------------------------
// Synonyms — map variant names to canonical keys in SPECIALTY_REQUIREMENTS
// ---------------------------------------------------------------------------

export const SPECIALTY_SYNONYMS: Record<string, string> = {
  // Cardiology
  cardiac: 'cardiology',
  'cardiac surgery': 'cardiology',
  'cardio thoracic surgery': 'cardiology',
  'cardiovascular': 'cardiology',

  // Surgery
  'surgical': 'general surgery',
  'gen surgery': 'general surgery',
  'minimal invasive surgery': 'general surgery',
  'laparoscopic surgery': 'general surgery',

  // Orthopedics
  orthopaedics: 'orthopedics',
  ortho: 'orthopedics',
  'orthopedic surgery': 'orthopedics',
  'orthopaedic surgery': 'orthopedics',
  'bone & joint': 'orthopedics',

  // ENT
  'otorhinolaryngology': 'ent',
  'otolaryngology': 'ent',
  'ear nose throat': 'ent',
  'ear, nose & throat': 'ent',

  // Ophthalmology
  'eye': 'ophthalmology',
  'eye care': 'ophthalmology',

  // Gynecology / Obstetrics
  'obs & gyn': 'gynecology',
  'obs and gyn': 'gynecology',
  'obstetrics & gynecology': 'gynecology',
  'obstetrics and gynecology': 'gynecology',
  'ob-gyn': 'gynecology',
  'obgyn': 'gynecology',
  'o&g': 'gynecology',
  'maternity': 'obstetrics',

  // Pediatrics
  paediatrics: 'pediatrics',
  'child care': 'pediatrics',
  'neonatology': 'pediatrics',

  // Nephrology
  renal: 'nephrology',
  'kidney': 'nephrology',

  // Pulmonology
  'respiratory medicine': 'pulmonology',
  'chest medicine': 'pulmonology',
  'pulmonary medicine': 'pulmonology',
  'tb & chest': 'pulmonology',

  // Gastro
  gastro: 'gastroenterology',
  'gi surgery': 'gastroenterology',
  'digestive': 'gastroenterology',

  // Dermatology
  skin: 'dermatology',
  'skin & vd': 'dermatology',

  // Psychiatry
  'mental health': 'psychiatry',
  'behavioral health': 'psychiatry',

  // Endocrinology
  diabetes: 'endocrinology',
  'diabetology': 'endocrinology',

  // ICU / Critical care
  'intensive care': 'critical care',
  'critical care medicine': 'critical care',

  // Emergency
  emergency: 'emergency medicine',
  'casualty': 'emergency medicine',
  'trauma': 'emergency medicine',
  'accident & emergency': 'emergency medicine',

  // Lab
  lab: 'laboratory',
  'clinical laboratory': 'laboratory',
  'diagnostic lab': 'laboratory',

  // Physiotherapy
  physio: 'physiotherapy',
  'physical therapy': 'physiotherapy',
  'rehabilitation': 'physiotherapy',

  // Dental
  dentistry: 'dental',
  'oral surgery': 'dental',

  // Neurology
  neuro: 'neurology',

  // Oncology
  cancer: 'oncology',
  'radiation oncology': 'oncology',
  'medical oncology': 'oncology',
  'surgical oncology': 'oncology',

  // General medicine
  medicine: 'general medicine',
  'internal medicine': 'general medicine',
  'family medicine': 'general medicine',
  'general physician': 'general medicine',

  // Urology
  'uro surgery': 'urology',

  // Plastic surgery
  cosmetic: 'plastic surgery',
  'cosmetic surgery': 'plastic surgery',
  'reconstructive surgery': 'plastic surgery',

  // Anesthesiology
  anaesthesia: 'anesthesiology',
  anaesthesiology: 'anesthesiology',
  anesthesia: 'anesthesiology',

  // Pathology
  'histopathology': 'pathology',
  'clinical pathology': 'pathology',

  // Radiology
  imaging: 'radiology',
  'diagnostic imaging': 'radiology',
};

// ---------------------------------------------------------------------------
// Facility type expectations
// ---------------------------------------------------------------------------

export interface FacilityTypeExpectation {
  max_reasonable_specialties: number;
  max_reasonable_departments: number;
  expects_ot: boolean;
  expects_icu: boolean;
  /** Minimum beds to expect ICU at this type */
  icu_bed_threshold?: number;
  expects_emergency: boolean;
  min_expected_doctors: number;
}

export const FACILITY_TYPE_EXPECTATIONS: Record<string, FacilityTypeExpectation> = {
  Hospital: {
    max_reasonable_specialties: 30,
    max_reasonable_departments: 25,
    expects_ot: true,
    expects_icu: true,
    icu_bed_threshold: 50,
    expects_emergency: true,
    min_expected_doctors: 5,
  },
  'Multi-Specialty Hospital': {
    max_reasonable_specialties: 35,
    max_reasonable_departments: 30,
    expects_ot: true,
    expects_icu: true,
    icu_bed_threshold: 30,
    expects_emergency: true,
    min_expected_doctors: 10,
  },
  'Super-Specialty Hospital': {
    max_reasonable_specialties: 40,
    max_reasonable_departments: 35,
    expects_ot: true,
    expects_icu: true,
    icu_bed_threshold: 20,
    expects_emergency: true,
    min_expected_doctors: 15,
  },
  Clinic: {
    max_reasonable_specialties: 5,
    max_reasonable_departments: 3,
    expects_ot: false,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 1,
  },
  Polyclinic: {
    max_reasonable_specialties: 10,
    max_reasonable_departments: 8,
    expects_ot: false,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 3,
  },
  'Nursing Home': {
    max_reasonable_specialties: 10,
    max_reasonable_departments: 8,
    expects_ot: true,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 2,
  },
  'Diagnostic Center': {
    max_reasonable_specialties: 5,
    max_reasonable_departments: 5,
    expects_ot: false,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 2,
  },
  'Maternity Home': {
    max_reasonable_specialties: 5,
    max_reasonable_departments: 5,
    expects_ot: true,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 2,
  },
  'Eye Hospital': {
    max_reasonable_specialties: 5,
    max_reasonable_departments: 5,
    expects_ot: true,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 2,
  },
  'Dental Clinic': {
    max_reasonable_specialties: 3,
    max_reasonable_departments: 2,
    expects_ot: false,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 1,
  },
  'Ayurveda Hospital': {
    max_reasonable_specialties: 8,
    max_reasonable_departments: 6,
    expects_ot: false,
    expects_icu: false,
    expects_emergency: false,
    min_expected_doctors: 2,
  },
  'Primary Health Center': {
    max_reasonable_specialties: 3,
    max_reasonable_departments: 3,
    expects_ot: false,
    expects_icu: false,
    expects_emergency: true,
    min_expected_doctors: 1,
  },
  'Community Health Center': {
    max_reasonable_specialties: 8,
    max_reasonable_departments: 6,
    expects_ot: true,
    expects_icu: false,
    expects_emergency: true,
    min_expected_doctors: 4,
  },
  'District Hospital': {
    max_reasonable_specialties: 20,
    max_reasonable_departments: 15,
    expects_ot: true,
    expects_icu: true,
    icu_bed_threshold: 30,
    expects_emergency: true,
    min_expected_doctors: 10,
  },
};

// ---------------------------------------------------------------------------
// Accreditation keywords
// ---------------------------------------------------------------------------

export const ACCREDITATION_KEYWORDS: string[] = [
  'NABH',
  'ISO',
  'JCI',
  'NABL',
  'QCI',
  'ISO 9001',
  'ISO 14001',
  'NQAS',
  'Kayakalp',
];

// ---------------------------------------------------------------------------
// Important fields for completeness scoring
// ---------------------------------------------------------------------------

export const IMPORTANT_FIELDS: string[] = [
  'facility_name',
  'facility_type',
  'state',
  'district',
  'pincode',
  'address',
  'latitude',
  'longitude',
  'num_doctors',
  'num_beds',
  'specialties',
  'equipment',
  'procedures',
  'departments',
  'ownership',
  'emergency_services',
  'website',
  'last_updated',
  'capabilities_text',
];
