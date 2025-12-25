const fetch = require('node-fetch');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    vendorUserName: 'IntelepeerTest',
    defaultProviderGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
    defaultLocationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db'
};

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'}[c]));
}

function buildXmlRequest(procedure, params = {}) {
    const paramElements = Object.entries(params).filter(([_, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

function parseXmlResponse(xmlText) {
    const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    const status = statusMatch ? statusMatch[1] : 'Unknown';
    if (status === 'Error' || status !== 'Success') {
        const errorMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
        if (errorMatch && (errorMatch[1].includes('Error') || errorMatch[1].includes('error'))) {
            throw new Error(errorMatch[1]);
        }
    }
    const records = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(xmlText)) !== null) {
        const record = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
            record[fieldMatch[1]] = fieldMatch[2];
        }
        records.push(record);
    }
    return { status, records };
}

function cleanParams(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '' && value !== 'NULL' && value !== 'null' && value !== 'None' && value !== 'none' && value !== 'N/A' && value !== 'n/a') {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

function formatBirthdayForCloud9(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}T00:00:00`;
}

function extractGuidFromResult(result, pattern) {
    if (!result) return null;
    const match = result.match(pattern);
    return match ? match[1] : null;
}

async function callCloud9(procedure, apiParams) {
    const xmlRequest = buildXmlRequest(procedure, apiParams);
    console.log(`[chord_patient] Calling Cloud9: ${procedure}`);
    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlRequest,
        timeout: 30000
    });
    const xmlText = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return parseXmlResponse(xmlText);
}

async function executeRequest() {
    const toolName = 'chord_patient';
    const action = $action;
    console.log(`[${toolName}] Action: ${action}`);

    const validActions = ['lookup', 'get', 'create', 'appointments', 'clinic_info', 'edit_insurance', 'confirm_appointment'];
    if (!action || !validActions.includes(action)) {
        throw new Error(`Invalid action '${action}'. Valid: ${validActions.join(', ')}`);
    }

    const rawParams = {
        phoneNumber: typeof $phoneNumber !== 'undefined' ? $phoneNumber : null,
        filter: typeof $filter !== 'undefined' ? $filter : null,
        patientGUID: typeof $patientGUID !== 'undefined' ? $patientGUID : null,
        patientFirstName: typeof $patientFirstName !== 'undefined' ? $patientFirstName : null,
        patientLastName: typeof $patientLastName !== 'undefined' ? $patientLastName : null,
        birthdayDateTime: typeof $birthdayDateTime !== 'undefined' ? $birthdayDateTime : null,
        gender: typeof $gender !== 'undefined' ? $gender : null,
        emailAddress: typeof $emailAddress !== 'undefined' ? $emailAddress : null,
        providerGUID: typeof $providerGUID !== 'undefined' ? $providerGUID : null,
        locationGUID: typeof $locationGUID !== 'undefined' ? $locationGUID : null,
        insuranceProvider: typeof $insuranceProvider !== 'undefined' ? $insuranceProvider : null,
        insuranceGroupId: typeof $insuranceGroupId !== 'undefined' ? $insuranceGroupId : null,
        insuranceMemberId: typeof $insuranceMemberId !== 'undefined' ? $insuranceMemberId : null,
        appointmentId: typeof $appointmentId !== 'undefined' ? $appointmentId : null
    };
    const params = cleanParams(rawParams);

    try {
        let result;

        switch (action) {
            case 'lookup': {
                if (!params.phoneNumber && !params.filter) throw new Error('phoneNumber or filter required');
                const apiParams = {};
                if (params.locationGUID) apiParams.LocGUIDs = params.locationGUID;
                const parsed = await callCloud9('GetPatientList', apiParams);
                const searchPhone = params.phoneNumber ? params.phoneNumber.replace(/\D/g, '') : null;
                const searchName = params.filter ? params.filter.toLowerCase() : null;
                const filtered = parsed.records.filter(p => {
                    const patPhone = (p.PhoneNumber || p.CellPhone || p.HomePhone || '').replace(/\D/g, '');
                    if (searchPhone && patPhone.includes(searchPhone)) return true;
                    if (searchName) {
                        const fullName = `${p.PatientLastName || ''}, ${p.PatientFirstName || ''}`.toLowerCase();
                        const reverseName = `${p.PatientFirstName || ''} ${p.PatientLastName || ''}`.toLowerCase();
                        return fullName.includes(searchName) || reverseName.includes(searchName);
                    }
                    return false;
                });
                result = { patients: filtered, count: filtered.length };
                break;
            }

            case 'get': {
                if (!params.patientGUID) throw new Error('patientGUID required');
                const parsed = await callCloud9('GetPatientInformation', { patguid: params.patientGUID });
                result = { patient: parsed.records[0] || null };
                break;
            }

            case 'create': {
                if (!params.patientFirstName) throw new Error('patientFirstName required');
                if (!params.patientLastName) throw new Error('patientLastName required');

                // USE DEFAULTS if not provided - THIS IS THE KEY FIX
                const providerGUID = params.providerGUID || CLOUD9.defaultProviderGUID;
                const locationGUID = params.locationGUID || CLOUD9.defaultLocationGUID;
                console.log(`[chord_patient] Using providerGUID: ${providerGUID}`);
                console.log(`[chord_patient] Using locationGUID: ${locationGUID}`);

                const apiParams = {
                    patientFirstName: params.patientFirstName,
                    patientLastName: params.patientLastName,
                    providerGUID: providerGUID,
                    locationGUID: locationGUID,
                    VendorUserName: CLOUD9.vendorUserName
                };
                if (params.birthdayDateTime) apiParams.birthdayDateTime = formatBirthdayForCloud9(params.birthdayDateTime);
                if (params.phoneNumber) apiParams.phoneNumber = params.phoneNumber;
                if (params.emailAddress) apiParams.email = params.emailAddress;
                if (params.gender) apiParams.gender = params.gender;

                const parsed = await callCloud9('SetPatient', apiParams);
                const createResult = parsed.records[0]?.Result || '';
                const patientGUID = extractGuidFromResult(createResult, /Patient Added:\s*([A-Fa-f0-9-]+)/i);
                result = { success: createResult.includes('Added'), patientGUID: patientGUID, message: createResult };
                console.log(`[${toolName}] Patient created: ${patientGUID}`);
                break;
            }

            case 'appointments': {
                if (!params.patientGUID) throw new Error('patientGUID required');
                const parsed = await callCloud9('GetAppointmentListByPatient', { patGUID: params.patientGUID });
                result = { appointments: parsed.records, count: parsed.records.length };
                break;
            }

            case 'clinic_info': {
                const parsed = await callCloud9('GetLocations', {});
                const locations = parsed.records;
                if (params.locationGUID) {
                    const match = locations.find(l => l.LocationGUID && l.LocationGUID.toLowerCase() === params.locationGUID.toLowerCase());
                    if (match) result = { success: true, location: match, matchType: 'guid' };
                }
                if (!result) result = { success: true, locations: locations, count: locations.length, location: locations[0] || null };
                break;
            }

            case 'edit_insurance': {
                if (!params.patientGUID) throw new Error('patientGUID required');
                const insuranceNote = `=== Insurance Information ==\nProvider: ${params.insuranceProvider || 'N/A'}\nGroup ID: ${params.insuranceGroupId || 'N/A'}\nMember ID: ${params.insuranceMemberId || 'N/A'}\nUpdated: ${new Date().toISOString()}`;
                const parsed = await callCloud9('SetPatientComment', { patGUID: params.patientGUID, patComment: insuranceNote });
                const updateResult = parsed.records[0]?.Result || 'Insurance info saved';
                result = { success: !updateResult.toLowerCase().includes('error'), message: updateResult };
                break;
            }

            case 'confirm_appointment': {
                if (!params.appointmentId) throw new Error('appointmentId required');
                const parsed = await callCloud9('SetAppointmentStatusConfirmed', { apptGUID: params.appointmentId });
                const confirmResult = parsed.records[0]?.Result || 'Appointment confirmed';
                result = { success: !confirmResult.toLowerCase().includes('error'), message: confirmResult };
                break;
            }
        }

        return JSON.stringify(result);
    } catch (error) {
        console.error(`[${toolName}] Error:`, error.message);
        return JSON.stringify({ error: `Failed to execute ${action}`, message: error.message, action: action, timestamp: new Date().toISOString() });
    }
}

return executeRequest();
