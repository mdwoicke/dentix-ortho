/**
 * Count appointment types for Chair 8 at CDH - Allegheny 202
 */

import * as fs from 'fs';

interface Appointment {
  AppointmentTypeGUID: string;
  AppointmentTypeDescription: string;
  [key: string]: string;
}

interface TypeCount {
  AppointmentTypeGUID: string;
  Description: string;
  Count: number;
}

const pastData = JSON.parse(fs.readFileSync('./past-chair8-both-locations.json', 'utf8'));
const todayData = JSON.parse(fs.readFileSync('./chair8-allegheny-results.json', 'utf8'));

const allAppts: Appointment[] = [
  ...pastData.results['CDH - Allegheny 202'].appointments,
  ...todayData.appointments
];

// Count by AppointmentTypeGUID
const typeCounts: Record<string, TypeCount> = {};

for (const appt of allAppts) {
  const typeGUID = appt.AppointmentTypeGUID;
  const typeDesc = appt.AppointmentTypeDescription;

  if (!typeCounts[typeGUID]) {
    typeCounts[typeGUID] = {
      AppointmentTypeGUID: typeGUID,
      Description: typeDesc,
      Count: 0
    };
  }
  typeCounts[typeGUID].Count++;
}

// Sort by count descending
const sorted = Object.values(typeCounts).sort((a, b) => b.Count - a.Count);

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  Chair 8 Appointment Type Counts - CDH Allegheny 202          ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Location: CDH - Allegheny 202');
console.log('LocationGUID: 1fef9297-7c8b-426b-b0d1-f2275136e48b');
console.log('Chair 8 schdcolGUID: 07687884-7e37-49aa-8028-d43b751c9034');
console.log('');
console.log('Total Chair 8 Appointments:', allAppts.length);
console.log('Unique Appointment Types:', sorted.length);
console.log('');
console.log('='.repeat(90));

for (const t of sorted) {
  console.log('');
  console.log(`  AppointmentTypeGUID: ${t.AppointmentTypeGUID}`);
  console.log(`  Description: ${t.Description}`);
  console.log(`  Count: ${t.Count}`);
}

console.log('');
console.log('='.repeat(90));
console.log('');
console.log('### Summary Table ###');
console.log('');

// Print as markdown table
const header = '| Count | Description | AppointmentTypeGUID |';
const separator = '|-------|-------------|---------------------|';
console.log(header);
console.log(separator);

for (const t of sorted) {
  const countStr = String(t.Count).padStart(5);
  const descStr = t.Description.substring(0, 45).padEnd(45);
  console.log(`| ${countStr} | ${descStr} | \`${t.AppointmentTypeGUID}\` |`);
}

// Save to JSON
fs.writeFileSync('./allegheny202-chair8-type-counts.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  location: 'CDH - Allegheny 202',
  locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
  chair8SchdcolGUID: '07687884-7e37-49aa-8028-d43b751c9034',
  totalAppointments: allAppts.length,
  appointmentTypeCounts: sorted
}, null, 2));

console.log('');
console.log('Results saved to: ./allegheny202-chair8-type-counts.json');
