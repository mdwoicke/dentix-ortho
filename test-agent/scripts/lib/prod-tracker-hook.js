/**
 * Prod Tracker Hook - Automatically add test records to prod_test_records
 *
 * Usage in test scripts:
 *   const { addPatientRecord, addAppointmentRecord, addTestResults } = require('./lib/prod-tracker-hook');
 *
 *   // After creating a patient:
 *   await addPatientRecord({
 *     patient_guid: 'ABC123...',
 *     patient_first_name: 'TEST_User',
 *     patient_last_name: 'TestFamily',
 *     patient_birthdate: '01/15/1986',
 *     location_guid: '1fef9297-...'
 *   });
 *
 *   // After booking an appointment:
 *   await addAppointmentRecord({
 *     patient_guid: 'ABC123...',
 *     appointment_guid: 'DEF456...',
 *     patient_first_name: 'TEST_User',
 *     patient_last_name: 'TestFamily',
 *     appointment_datetime: '3/12/2026 9:50:00 AM',
 *     schedule_view_guid: '4c9e9333-...',
 *     schedule_column_guid: '07687884-...'
 *   });
 *
 *   // Or add multiple results at once:
 *   await addTestResults({ patients: [...], appointments: [...] });
 */

const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/test-results.db');

function getDb() {
  return new BetterSqlite3(DB_PATH);
}

/**
 * Add a patient record to prod_test_records
 */
function addPatientRecord(data) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT INTO prod_test_records
      (record_type, patient_guid, patient_first_name, patient_last_name,
       patient_birthdate, patient_phone, patient_email, location_guid,
       status, created_at, updated_at)
      VALUES ('patient', ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    stmt.run(
      data.patient_guid,
      data.patient_first_name,
      data.patient_last_name,
      data.patient_birthdate || null,
      data.patient_phone || null,
      data.patient_email || null,
      data.location_guid || null,
      now,
      now
    );

    console.log(`[Prod Tracker] Added patient: ${data.patient_first_name} ${data.patient_last_name} (${data.patient_guid})`);
    return true;
  } catch (error) {
    console.error(`[Prod Tracker] Failed to add patient: ${error.message}`);
    return false;
  } finally {
    db.close();
  }
}

/**
 * Add an appointment record to prod_test_records
 */
function addAppointmentRecord(data) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT INTO prod_test_records
      (record_type, patient_guid, appointment_guid, patient_first_name, patient_last_name,
       appointment_datetime, schedule_view_guid, schedule_column_guid,
       appointment_type_guid, appointment_minutes, location_guid,
       status, created_at, updated_at)
      VALUES ('appointment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    stmt.run(
      data.patient_guid,
      data.appointment_guid,
      data.patient_first_name,
      data.patient_last_name,
      data.appointment_datetime || null,
      data.schedule_view_guid || null,
      data.schedule_column_guid || null,
      data.appointment_type_guid || null,
      data.appointment_minutes || null,
      data.location_guid || null,
      now,
      now
    );

    console.log(`[Prod Tracker] Added appointment: ${data.patient_first_name} - ${data.appointment_datetime} (${data.appointment_guid})`);
    return true;
  } catch (error) {
    console.error(`[Prod Tracker] Failed to add appointment: ${error.message}`);
    return false;
  } finally {
    db.close();
  }
}

/**
 * Add multiple test results at once
 * @param {Object} results - { patients: [...], appointments: [...] }
 */
function addTestResults(results) {
  const db = getDb();
  const now = new Date().toISOString();
  let added = { patients: 0, appointments: 0 };

  try {
    const patientStmt = db.prepare(`
      INSERT INTO prod_test_records
      (record_type, patient_guid, patient_first_name, patient_last_name,
       patient_birthdate, patient_phone, patient_email, location_guid,
       status, created_at, updated_at)
      VALUES ('patient', ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    const apptStmt = db.prepare(`
      INSERT INTO prod_test_records
      (record_type, patient_guid, appointment_guid, patient_first_name, patient_last_name,
       appointment_datetime, schedule_view_guid, schedule_column_guid,
       appointment_type_guid, appointment_minutes, location_guid,
       status, created_at, updated_at)
      VALUES ('appointment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    // Add patients
    if (results.patients) {
      for (const p of results.patients) {
        patientStmt.run(
          p.patient_guid,
          p.patient_first_name,
          p.patient_last_name,
          p.patient_birthdate || null,
          p.patient_phone || null,
          p.patient_email || null,
          p.location_guid || null,
          now,
          now
        );
        added.patients++;
      }
    }

    // Add appointments
    if (results.appointments) {
      for (const a of results.appointments) {
        apptStmt.run(
          a.patient_guid,
          a.appointment_guid,
          a.patient_first_name,
          a.patient_last_name,
          a.appointment_datetime || null,
          a.schedule_view_guid || null,
          a.schedule_column_guid || null,
          a.appointment_type_guid || null,
          a.appointment_minutes || null,
          a.location_guid || null,
          now,
          now
        );
        added.appointments++;
      }
    }

    console.log(`[Prod Tracker] Added ${added.patients} patients, ${added.appointments} appointments`);
    return added;
  } catch (error) {
    console.error(`[Prod Tracker] Failed to add results: ${error.message}`);
    return added;
  } finally {
    db.close();
  }
}

module.exports = {
  addPatientRecord,
  addAppointmentRecord,
  addTestResults
};
