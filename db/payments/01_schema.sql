-- Payments system of record (MySQL): the PCI DSS cardholder data environment (CDE).
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
