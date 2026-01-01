/**
 * Fix Node Red flow field mappings
 * Corrects the patient lookup and appointments response mappings
 */

const fs = require('fs');
const path = require('path');

const flowsPath = path.join(__dirname, '..', 'nodered', 'nodered_Cloud9_flows.json');

// Read the flows file
const flows = JSON.parse(fs.readFileSync(flowsPath, 'utf8'));

// Fix 1: Patient Lookup (getPatientByFilter)
const patientLookup = flows.find(n => n.name === 'getPatientByFilter');
if (patientLookup) {
    console.log('Found getPatientByFilter function, fixing patient mapping...');

    // Replace the buggy mapping code
    patientLookup.func = patientLookup.func.replace(
        /const patients = parsed\.records\.map\(p => \(\{[\s\S]*?patientGUID: p\.PatientGUID \|\| p\.patGUID,[\s\S]*?PatientName: p\.PatientName,[\s\S]*?PatientBirthdate: p\.PatientBirthDate \|\| p\.PatientBirthdate[\s\S]*?\}\)\);/,
        `const patients = parsed.records.map(p => {
                const firstName = p.PatientFirstName || '';
                const lastName = p.PatientLastName || '';
                const fullName = firstName && lastName ? \`\${firstName} \${lastName}\` : (firstName || lastName || '');
                return {
                    patientGUID: p.PatientGUID || p.patGUID,
                    PatientFirstName: firstName,
                    PatientLastName: lastName,
                    PatientName: fullName,
                    patientName: fullName,
                    PatientID: p.PatientID,
                    PatientBirthDate: p.PatientBirthDate || p.PatientBirthdate || '',
                    birthDate: p.PatientBirthDate || p.PatientBirthdate || '',
                    LocationGUID: p.LocationGUID,
                    LocationName: p.LocationName
                };
            });`
    );
    console.log('  - Fixed patient name and birthdate mapping');
}

// Fix 2: Patient Appointments (getPatientAppts)
const patientAppts = flows.find(n => n.name === 'getPatientAppts');
if (patientAppts) {
    console.log('Found getPatientAppts function, fixing appointments mapping...');

    // Replace the raw records output with mapped fields
    patientAppts.func = patientAppts.func.replace(
        /msg\.payload = \{ appointments: parsed\.records, count: parsed\.records\.length \};/,
        `const appointments = parsed.records.map(a => ({
            ...a,
            // Map to frontend-expected field names
            StartTime: a.AppointmentDateTime,
            AppointmentDate: a.AppointmentDateTime,
            AppointmentType: a.AppointmentTypeDescription,
            Status: a.AppointmentStatusDescription,
            GUID: a.AppointmentGUID,
            patientName: \`\${a.PatientFirstName || ''} \${a.PatientLastName || ''}\`.trim()
        }));
        msg.payload = { appointments, count: appointments.length };`
    );
    console.log('  - Fixed appointment field mappings');
}

// Write the updated flows
fs.writeFileSync(flowsPath, JSON.stringify(flows, null, 4), 'utf8');
console.log('\nUpdated flows written to:', flowsPath);

// Also update the V1 canonical file
const v1FlowsPath = path.join(__dirname, '..', 'docs', 'v1', 'nodered_Cloud9_flows.json');
if (fs.existsSync(v1FlowsPath)) {
    fs.writeFileSync(v1FlowsPath, JSON.stringify(flows, null, 4), 'utf8');
    console.log('Updated V1 canonical file:', v1FlowsPath);
}

console.log('\nDone! Please re-deploy the flows in Node Red.');
