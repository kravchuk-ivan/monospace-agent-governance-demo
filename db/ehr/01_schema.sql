-- EHR system of record (PostgreSQL). Synthetic data only.
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

CREATE ROLE monospace LOGIN PASSWORD 'monospace';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO monospace;
