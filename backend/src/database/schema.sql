-- Cloud 9 Ortho CRM Database Schema
-- SQLite database for caching Cloud 9 API data

-- Reference Data Tables (Cache)

CREATE TABLE IF NOT EXISTS locations (
  location_guid TEXT PRIMARY KEY,
  location_name TEXT NOT NULL,
  location_code TEXT,
  location_printed_name TEXT,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_postal_code TEXT,
  phone TEXT,
  time_zone TEXT,
  is_deleted BOOLEAN DEFAULT 0,
  environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointment_types (
  appointment_type_guid TEXT PRIMARY KEY,
  appointment_type_code TEXT,
  description TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  allow_online_scheduling BOOLEAN DEFAULT 0,
  is_deleted BOOLEAN DEFAULT 0,
  environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS providers (
  provider_guid TEXT PRIMARY KEY,
  location_guid TEXT,
  schedule_view_guid TEXT,
  schedule_column_guid TEXT,
  schedule_view_description TEXT,
  schedule_column_description TEXT,
  provider_name TEXT,
  start_time TEXT,
  end_time TEXT,
  environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_guid) REFERENCES locations(location_guid)
);

-- Patient Cache

CREATE TABLE IF NOT EXISTS patients (
  patient_guid TEXT PRIMARY KEY,
  patient_id TEXT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  suffix TEXT,
  birthdate TEXT,
  gender TEXT,
  email TEXT,
  phone TEXT,
  use_email BOOLEAN DEFAULT 0,
  use_phone BOOLEAN DEFAULT 0,
  use_text BOOLEAN DEFAULT 0,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_postal_code TEXT,
  location_guid TEXT,
  provider_guid TEXT,
  orthodontist_name TEXT,
  patient_status_description TEXT,
  last_appointment_date TEXT,
  estimated_completion_date TEXT,
  months_in_status INTEGER,
  environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_guid) REFERENCES locations(location_guid),
  FOREIGN KEY (provider_guid) REFERENCES providers(provider_guid)
);

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_location ON patients(location_guid);
CREATE INDEX IF NOT EXISTS idx_patients_environment ON patients(environment);

-- Appointment Cache

CREATE TABLE IF NOT EXISTS appointments (
  appointment_guid TEXT PRIMARY KEY,
  patient_guid TEXT NOT NULL,
  appointment_date_time TEXT NOT NULL,
  appointment_type_guid TEXT,
  appointment_type_description TEXT,
  location_guid TEXT,
  location_name TEXT,
  provider_guid TEXT,
  orthodontist_name TEXT,
  schedule_view_guid TEXT,
  schedule_view_description TEXT,
  schedule_column_guid TEXT,
  schedule_column_description TEXT,
  minutes INTEGER,
  status TEXT, -- 'Scheduled', 'Confirmed', 'Canceled', etc.
  environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_guid) REFERENCES patients(patient_guid),
  FOREIGN KEY (appointment_type_guid) REFERENCES appointment_types(appointment_type_guid),
  FOREIGN KEY (location_guid) REFERENCES locations(location_guid),
  FOREIGN KEY (provider_guid) REFERENCES providers(provider_guid)
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_guid);
CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(appointment_date_time);
CREATE INDEX IF NOT EXISTS idx_appointments_location ON appointments(location_guid);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_environment ON appointments(environment);

-- Cache Metadata

CREATE TABLE IF NOT EXISTS cache_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
  last_refreshed DATETIME DEFAULT CURRENT_TIMESTAMP,
  ttl_seconds INTEGER DEFAULT 3600, -- Default 1 hour
  UNIQUE(cache_key, environment)
);

-- Insert initial cache metadata entries
INSERT OR IGNORE INTO cache_metadata (cache_key, environment, ttl_seconds) VALUES
  ('locations', 'sandbox', 86400),
  ('locations', 'production', 86400),
  ('appointment_types', 'sandbox', 86400),
  ('appointment_types', 'production', 86400),
  ('providers', 'sandbox', 43200),
  ('providers', 'production', 43200);

-- Prompt Version Management Tables

-- Store current working copies of prompts (updated as fixes are applied)
CREATE TABLE IF NOT EXISTS prompt_working_copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_key TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  last_fix_id TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Store version history for prompts (each version is immutable)
CREATE TABLE IF NOT EXISTS prompt_version_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  fix_id TEXT,
  change_description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_file_key ON prompt_version_history(file_key);
CREATE INDEX IF NOT EXISTS idx_prompt_history_version ON prompt_version_history(file_key, version);
