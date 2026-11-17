// Generates the init SQL for both systems of record. Deterministic: same output every run.
//   node db/generate.mjs
// Writes db/ehr/*.sql (PostgreSQL) and db/payments/*.sql (MySQL). All data is synthetic.
// Card numbers are public test PANs (Visa 4111..., Mastercard 5555..., Amex 3782...).

import { writeFileSync, mkdirSync } from 'node:fs'

let seed = 20261117
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (list) => list[Math.floor(rand() * list.length)]
const int = (min, max) => min + Math.floor(rand() * (max - min + 1))
const pad = (n, w = 2) => String(n).padStart(w, '0')
const q = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Isabella', 'Mateo', 'Mia', 'Ethan', 'Amelia', 'Logan', 'Harper', 'Aiden', 'Evelyn', 'Daniel', 'Abigail', 'Henry', 'Ella', 'Samuel', 'Grace', 'David', 'Chloe', 'Joseph', 'Nora', 'Carter', 'Lily', 'Wyatt', 'Zoe', 'Julian', 'Priya', 'Wei', 'Fatima', 'Kenji', 'Aisha', 'Diego', 'Hana', 'Omar']
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Nguyen', 'Kim', 'Patel', 'Chen', 'Singh', 'Khan']
const DIAGNOSES = [
  ['E11.9', 'Type 2 diabetes mellitus without complications. A1c 7.4, continue metformin.'],
  ['I10', 'Essential hypertension. BP 148/92, titrating lisinopril.'],
  ['F41.1', 'Generalized anxiety disorder. Referred to behavioral health, started sertraline.'],
  ['J45.909', 'Mild persistent asthma. Albuterol PRN, review inhaler technique.'],
  ['M54.5', 'Low back pain, 6 weeks. PT referral, NSAIDs.'],
  ['F32.1', 'Major depressive disorder, moderate. PHQ-9 of 15. Follow up in 2 weeks.'],
  ['Z34.90', 'Supervision of normal pregnancy, 22 weeks. Anatomy scan normal.'],
  ['B20', 'HIV disease, viral load undetectable on ART. Continue current regimen.'],
  ['E66.01', 'Morbid obesity, BMI 41. Discussed bariatric referral.'],
  ['K21.9', 'GERD without esophagitis. PPI trial 8 weeks.'],
]
const REASONS = ['Annual physical', 'Follow-up visit', 'Medication review', 'Lab results review', 'Flu shot', 'New patient visit', 'Telehealth check-in', 'Blood pressure check', 'Physical therapy', 'Prenatal visit']
const CARDS = [
  ['visa', '4111111111111111'], ['visa', '4012888888881881'], ['visa', '4242424242424242'],
  ['mastercard', '5555555555554444'], ['mastercard', '5105105105105100'], ['mastercard', '2223003122003222'],
  ['amex', '378282246310005'], ['discover', '6011111111111117'],
]

// ---------------------------------------------------------------------------
// EHR (PostgreSQL)
// ---------------------------------------------------------------------------
const clinics = [
  [1, 'Riverside Downtown', 'Austin', 'TX'],
  [2, 'Riverside Northgate', 'Austin', 'TX'],
  [3, 'Lakeside Pediatrics', 'Round Rock', 'TX'],
]
const providers = [
  [1, 1, 'Dr. Anika Patel', 'Internal Medicine'], [2, 1, 'Dr. Marcus Reed', 'Family Medicine'], [3, 1, 'Dr. Lena Novak', 'Behavioral Health'],
  [4, 2, 'Dr. Samuel Osei', 'Family Medicine'], [5, 2, 'Dr. Grace Liu', 'Obstetrics'], [6, 2, 'Dr. Tom Becker', 'Cardiology'],
  [7, 3, 'Dr. Rosa Jimenez', 'Pediatrics'], [8, 3, 'Dr. Ben Carter', 'Pediatrics'],
]

// Hero records used in the demo script (keep stable).
const patients = [
  { id: 1, clinic: 1, first: 'Maria', last: 'Alvarez', dob: '1984-03-12', dx: DIAGNOSES[1] },
  { id: 2, clinic: 1, first: 'Daniel', last: 'Kim', dob: '1979-11-02', dx: DIAGNOSES[5] },
  { id: 3, clinic: 2, first: 'James', last: 'Okafor', dob: '1991-07-21', dx: DIAGNOSES[7] },
  { id: 4, clinic: 2, first: 'Priya', last: 'Shah', dob: '1995-01-30', dx: DIAGNOSES[6] },
]
for (let id = 5; id <= 60; id++) {
  const clinic = id % 3 === 0 ? 3 : id % 3 === 1 ? 1 : 2
  const year = clinic === 3 ? int(2012, 2022) : int(1948, 2001)
  patients.push({ id, clinic, first: pick(FIRST), last: pick(LAST), dob: `${year}-${pad(int(1, 12))}-${pad(int(1, 28))}`, dx: pick(DIAGNOSES) })
}
for (const p of patients) {
  p.mrn = `MRN-${100000 + p.id}`
  p.phone = `(512) 555-${pad(int(100, 9999), 4)}`
  p.email = `${p.first}.${p.last}${p.id}@example.com`.toLowerCase()
  p.ssn = `${int(100, 665)}-${pad(int(10, 99))}-${pad(int(1000, 9999), 4)}`
  p.insurance = `${pick(['CGN', 'AET', 'UHC', 'BCBS'])}${int(10000000, 99999999)}`
}

const providersByClinic = (c) => providers.filter((p) => p[1] === c)
const appointments = []
let apptId = 1
// Hero appointments
appointments.push({ id: apptId++, patient: 1, provider: 1, clinic: 1, at: '2026-11-19 10:00:00-06', status: 'confirmed', reason: 'Blood pressure check' })
appointments.push({ id: apptId++, patient: 1, provider: 1, clinic: 1, at: '2026-11-03 09:30:00-06', status: 'completed', reason: 'Follow-up visit' })
appointments.push({ id: apptId++, patient: 3, provider: 4, clinic: 2, at: '2026-11-19 14:00:00-06', status: 'scheduled', reason: 'Lab results review' })
for (const p of patients) {
  const n = int(1, 4)
  for (let i = 0; i < n; i++) {
    const day = int(1, 30)
    const future = day >= 17
    const status = future ? pick(['scheduled', 'confirmed', 'confirmed']) : pick(['completed', 'completed', 'completed', 'cancelled', 'no_show'])
    const [provider] = pick(providersByClinic(p.clinic))
    appointments.push({ id: apptId++, patient: p.id, provider, clinic: p.clinic, at: `2026-11-${pad(day)} ${pad(int(8, 16))}:${pick(['00', '30'])}:00-06`, status, reason: pick(REASONS) })
  }
}

let ehrSchema = `-- EHR system of record (PostgreSQL). Synthetic data only.
CREATE TABLE clinics (
  id integer PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  state char(2) NOT NULL
);

CREATE TABLE providers (
  id integer PRIMARY KEY,
  clinic_id integer NOT NULL REFERENCES clinics(id),
  full_name text NOT NULL,
  specialty text NOT NULL
);

CREATE TABLE patients (
  id integer PRIMARY KEY,
  clinic_id integer NOT NULL REFERENCES clinics(id),
  mrn text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  ssn text NOT NULL,                     -- PHI / PII
  insurance_member_id text NOT NULL,     -- PHI
  primary_diagnosis_code text NOT NULL,  -- PHI (ICD-10)
  clinical_notes text NOT NULL           -- PHI
);

CREATE TABLE appointments (
  id integer PRIMARY KEY,
  patient_id integer NOT NULL REFERENCES patients(id),
  provider_id integer NOT NULL REFERENCES providers(id),
  clinic_id integer NOT NULL REFERENCES clinics(id),
  starts_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled','confirmed','checked_in','completed','cancelled','no_show')),
  reason text NOT NULL
);
`

let ehrSeed = '-- Seed data (generated by db/generate.mjs)\n'
ehrSeed += `INSERT INTO clinics VALUES\n${clinics.map((c) => `(${c.map(q).join(', ')})`).join(',\n')};\n\n`
ehrSeed += `INSERT INTO providers VALUES\n${providers.map((c) => `(${c.map(q).join(', ')})`).join(',\n')};\n\n`
ehrSeed += `INSERT INTO patients VALUES\n${patients
  .map((p) => `(${[p.id, p.clinic, p.mrn, p.first, p.last, p.dob, p.phone, p.email, p.ssn, p.insurance, p.dx[0], p.dx[1]].map(q).join(', ')})`)
  .join(',\n')};\n\n`
ehrSeed += `INSERT INTO appointments VALUES\n${appointments
  .map((a) => `(${[a.id, a.patient, a.provider, a.clinic, a.at, a.status, a.reason].map(q).join(', ')})`)
  .join(',\n')};\n`

// ---------------------------------------------------------------------------
// Payments (MySQL): a separate billing system, the PCI cardholder data environment
// ---------------------------------------------------------------------------
const accounts = patients.map((p) => ({ id: 5000 + p.id, patient: p.id, clinic: p.clinic, holder: `${p.first} ${p.last}`, status: 'active' }))
const methods = []
let pmId = 1
for (const a of accounts) {
  const n = a.patient === 1 ? 1 : int(1, 2)
  for (let i = 0; i < n; i++) {
    const [brand, pan] = a.patient === 1 ? CARDS[0] : pick(CARDS)
    methods.push({ id: pmId++, account: a.id, name: a.holder, brand, pan, last4: pan.slice(-4), month: int(1, 12), year: int(2027, 2031), zip: `78${pad(int(700, 799), 3)}`, isDefault: i === 0 ? 1 : 0 })
  }
}
const charges = []
let chId = 1
const completed = appointments.filter((a) => a.status === 'completed' || a.status === 'no_show')
for (const a of completed) {
  const account = accounts.find((acc) => acc.patient === a.patient)
  const isHero = a.id === 2
  const amount = isHero ? '185.00' : a.status === 'no_show' ? '50.00' : pick(['25.00', '40.00', '75.00', '120.00', '210.00', '340.00'])
  const status = isHero ? 'succeeded' : pick(['succeeded', 'succeeded', 'succeeded', 'pending', 'failed'])
  charges.push({ id: chId++, account: account.id, appt: a.id, amount, status, desc: a.status === 'no_show' ? 'No-show fee' : `Visit copay: ${a.reason}`, at: a.at.replace(/-06$/, '') })
}
// Balance = pending + failed charges
for (const a of accounts) {
  const due = charges.filter((c) => c.account === a.id && c.status !== 'succeeded').reduce((s, c) => s + Number(c.amount), 0)
  a.balance = due.toFixed(2)
}
const refunds = [
  { id: 1, charge: charges.find((c) => c.status === 'succeeded' && c.account !== 5001).id, amount: '25.00', reason: 'Duplicate copay', by: 'billing.ops@riverside.example', at: '2026-11-10 11:12:00' },
]

const paySchema = `-- Payments system of record (MySQL): the PCI DSS cardholder data environment (CDE).
-- Synthetic data. Card numbers are public test PANs. A real CDE must encrypt or tokenize PANs
-- at rest (PCI DSS 3.5); this demo keeps them in clear text on purpose to show field-level control.
CREATE TABLE billing_accounts (
  id INT PRIMARY KEY,
  ehr_patient_id INT NOT NULL,          -- reference into the EHR (another database, no FK)
  clinic_id INT NOT NULL,
  account_holder VARCHAR(120) NOT NULL,
  balance_due DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE payment_methods (
  id INT PRIMARY KEY,
  account_id INT NOT NULL,
  cardholder_name VARCHAR(120) NOT NULL, -- cardholder data
  card_brand VARCHAR(20) NOT NULL,
  card_number VARCHAR(19) NOT NULL,      -- PAN: cardholder data
  card_last4 CHAR(4) NOT NULL,           -- truncated PAN: OK to display
  exp_month TINYINT NOT NULL,            -- cardholder data
  exp_year SMALLINT NOT NULL,            -- cardholder data
  billing_zip VARCHAR(10) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_pm_account FOREIGN KEY (account_id) REFERENCES billing_accounts(id)
);

CREATE TABLE charges (
  id INT PRIMARY KEY,
  account_id INT NOT NULL,
  ehr_appointment_id INT NULL,           -- reference into the EHR (another database, no FK)
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL,           -- succeeded | pending | failed | refunded
  description VARCHAR(200) NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_charge_account FOREIGN KEY (account_id) REFERENCES billing_accounts(id)
);

CREATE TABLE refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  charge_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(200) NOT NULL,
  requested_by VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refund_charge FOREIGN KEY (charge_id) REFERENCES charges(id)
);

-- Read/write login Monospace uses. No DDL rights: the schema can't be changed through it.
CREATE USER 'monospace'@'%' IDENTIFIED BY 'monospace';
GRANT SELECT, INSERT, UPDATE ON payments.* TO 'monospace'@'%';
`

let paySeed = '-- Seed data (generated by db/generate.mjs)\n'
paySeed += `INSERT INTO billing_accounts VALUES\n${accounts.map((a) => `(${[a.id, a.patient, a.clinic, a.holder, a.balance, a.status].map(q).join(', ')})`).join(',\n')};\n\n`
paySeed += `INSERT INTO payment_methods VALUES\n${methods.map((m) => `(${[m.id, m.account, m.name, m.brand, m.pan, m.last4, m.month, m.year, m.zip, m.isDefault].map(q).join(', ')})`).join(',\n')};\n\n`
paySeed += `INSERT INTO charges VALUES\n${charges.map((c) => `(${[c.id, c.account, c.appt, c.amount, 'USD', c.status, c.desc, c.at].map(q).join(', ')})`).join(',\n')};\n\n`
paySeed += `INSERT INTO refunds VALUES\n${refunds.map((r) => `(${[r.id, r.charge, r.amount, r.reason, r.by, r.at].map(q).join(', ')})`).join(',\n')};\n`

// EHR login Monospace uses: read/write on data, no DDL.
ehrSchema += `
CREATE ROLE monospace LOGIN PASSWORD 'monospace';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO monospace;
`

const root = new URL('.', import.meta.url)
mkdirSync(new URL('ehr/', root), { recursive: true })
mkdirSync(new URL('payments/', root), { recursive: true })
writeFileSync(new URL('ehr/01_schema.sql', root), ehrSchema)
writeFileSync(new URL('ehr/02_seed.sql', root), ehrSeed)
writeFileSync(new URL('payments/01_schema.sql', root), paySchema)
writeFileSync(new URL('payments/02_seed.sql', root), paySeed)

console.log(`EHR: ${clinics.length} clinics, ${providers.length} providers, ${patients.length} patients, ${appointments.length} appointments`)
console.log(`Payments: ${accounts.length} accounts, ${methods.length} cards, ${charges.length} charges, ${refunds.length} refunds`)
