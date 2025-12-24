# Manual Testing Guide - Cloud 9 Ortho CRM

## Prerequisites
- ✅ Backend running on http://localhost:3001
- ✅ Frontend running on http://localhost:5173

## Testing Checklist

### 1. Initial Load & Dashboard
**URL**: http://localhost:5173

**Steps**:
1. Open http://localhost:5173 in your browser
2. Check that the page loads without errors
3. Verify the Dashboard page appears with:
   - Navigation sidebar (Dashboard, Patients, Appointments, Calendar, Settings)
   - Top navbar with "Cloud 9 Ortho CRM" title
   - Environment indicator (Sandbox/Production)
   - Three quick action cards (Search Patients, View Appointments, Calendar View)
   - "Upcoming Appointments" section

**Expected Results**:
- ✅ No console errors
- ✅ Page renders correctly
- ✅ Sidebar navigation is visible
- ✅ Environment badge shows "Sandbox" (yellow) or "Production" (green)
- ✅ Upcoming appointments load automatically (next 7 days)

**What to Check**:
- Open browser DevTools (F12) and check Console for errors
- Check Network tab to see if API calls are succeeding

---

### 2. Patient Search
**URL**: http://localhost:5173/patients

**Steps**:
1. Click "Patients" in sidebar OR click "Go to Patients" on Dashboard
2. In the search bar, enter "John"
3. Click "Search" button
4. Wait for results to load

**Expected Results**:
- ✅ Search form appears with fields: First Name, Last Name, Email, Phone, Birthdate, Patient Number
- ✅ After searching, results table appears showing patients
- ✅ Results show patient names, birthdate, email, phone, location
- ✅ "X results found" message appears above table
- ✅ Each row has "View Details" button

**What to Check**:
- Network tab shows successful call to `/api/patients/search?query=John`
- Response status is 200
- Results are displayed in table format
- Click sorting on table columns works

---

### 3. Patient Details
**URL**: http://localhost:5173/patients/{guid}

**Steps**:
1. From patient search results, click "View Details" on any patient
2. Review the patient detail page

**Expected Results**:
- ✅ Patient card displays with full information:
  - Name, Patient ID, Birthdate, Gender
  - Email, Phone
  - Address (Street, City, State, Postal Code)
  - Location, Provider
- ✅ "Edit Patient" button visible
- ✅ "Schedule Appointment" button visible
- ✅ "Patient Appointments" section below showing appointment list
- ✅ Breadcrumb navigation (Patients > Patient Name)

**What to Check**:
- Network tab shows calls to `/api/patients/{guid}` and `/api/appointments/patient/{guid}`
- Data displays correctly
- Clicking breadcrumb navigates back to patient list

---

### 4. Edit Patient
**URL**: Patient detail page

**Steps**:
1. On patient detail page, click "Edit Patient"
2. Modal should open with patient form
3. Try changing the phone number
4. Click "Update Patient"

**Expected Results**:
- ✅ Modal opens with form pre-filled with patient data
- ✅ All fields are editable
- ✅ Form validation works (try removing required field)
- ✅ Success toast notification appears after update
- ✅ Patient data refreshes with new information
- ✅ Modal closes automatically

**What to Check**:
- Network tab shows PUT call to `/api/patients/{guid}`
- Toast notification appears (green success message)
- Modal has proper close button (X) and Cancel button

---

### 5. Create New Patient
**URL**: http://localhost:5173/patients

**Steps**:
1. On patient list page, click "New Patient" button
2. Fill out the form:
   - First Name: "Test"
   - Last Name: "Patient"
   - Birthdate: "01/01/2000"
   - Email: "test@example.com"
   - Phone: "555-123-4567"
   - Select a Location (dropdown)
   - Select a Provider (dropdown)
3. Click "Create Patient"

**Expected Results**:
- ✅ Modal opens with empty form
- ✅ Location and Provider dropdowns are populated
- ✅ Form validation prevents submission with missing fields
- ✅ Phone number formats as you type: (555) 123-4567
- ✅ Success toast appears after creation
- ✅ Patient list refreshes (or you're redirected to new patient)

**What to Check**:
- Network tab shows POST to `/api/patients`
- Reference data loads (locations, providers) from `/api/reference/*`
- Form validation shows error messages under fields

---

### 6. Appointments List
**URL**: http://localhost:5173/appointments

**Steps**:
1. Click "Appointments" in sidebar
2. Review the appointment list
3. Try the filters:
   - Set Start Date to today
   - Set End Date to 7 days from now
   - Click "Apply Filters"
4. Try "Clear Filters" button

**Expected Results**:
- ✅ Appointment list loads
- ✅ Filter panel shows: Start Date, End Date, Location, Provider
- ✅ Location and Provider dropdowns populated
- ✅ "Schedule Appointment" button visible
- ✅ Each appointment card shows:
  - Patient name
  - Date and time
  - Status badge (Scheduled/Confirmed/Cancelled)
  - Location and provider
  - Confirm/Cancel buttons (if applicable)

**What to Check**:
- Network calls to `/api/appointments/search` with proper filters
- Date pickers work correctly
- Filter combinations work

---

### 7. Appointment Calendar
**URL**: http://localhost:5173/calendar

**Steps**:
1. Click "Calendar" in sidebar
2. Review the calendar view
3. Try switching views: Month / Week / Day
4. Click on an appointment in the calendar
5. Try clicking on an empty time slot

**Expected Results**:
- ✅ FullCalendar loads with appointments
- ✅ View buttons (Month/Week/Day) work
- ✅ Appointments display as colored blocks
- ✅ Clicking appointment opens detail modal
- ✅ Clicking empty slot opens schedule modal
- ✅ "Schedule Appointment" button in header works

**What to Check**:
- Appointments render correctly on calendar
- Colors match appointment status
- Modals open/close properly
- Calendar navigation (prev/next month) works

---

### 8. Schedule New Appointment
**URL**: Calendar or Appointments page

**Steps**:
1. Click "Schedule Appointment" button
2. Fill out the form:
   - Search and select a patient (type to search)
   - Select Location
   - Select Appointment Type
   - Select Provider
   - Set Date and Time
   - Select Duration (30 min, 1 hour, etc.)
   - Add notes (optional)
3. Click "Schedule Appointment"

**Expected Results**:
- ✅ Modal opens with appointment form
- ✅ Patient search autocomplete works
- ✅ All dropdowns populate from reference data
- ✅ Duration presets work (15min, 30min, 1hr, etc.)
- ✅ Form validation prevents incomplete submissions
- ✅ Success toast appears
- ✅ Calendar/list refreshes with new appointment

**What to Check**:
- Network POST to `/api/appointments`
- Patient search makes calls to `/api/patients/search`
- Reference data loads for locations, types, providers

---

### 9. Confirm/Cancel Appointments
**URL**: Dashboard or Appointments page

**Steps**:
1. Find an appointment with "Scheduled" status
2. Click "Confirm" button
3. Verify status changes to "Confirmed"
4. Click "Cancel" on another appointment

**Expected Results**:
- ✅ Confirm button changes status to "Confirmed" (green badge)
- ✅ Cancel button changes status to "Cancelled" (red badge)
- ✅ Toast notifications appear for both actions
- ✅ Appointment list refreshes
- ✅ Disabled appointments show neither button

**What to Check**:
- Network PUT calls to `/api/appointments/{guid}/confirm` and `/cancel`
- Status badges update with correct colors
- Buttons become disabled after action

---

### 10. Settings Page
**URL**: http://localhost:5173/settings

**Steps**:
1. Click "Settings" in sidebar
2. Review current environment (Sandbox or Production)
3. Click "Switch to Production" (or Sandbox)
4. Verify environment indicator updates in navbar
5. Click "Refresh Cache" button

**Expected Results**:
- ✅ Settings page shows three sections:
  - Environment (with toggle)
  - Cache Management (with refresh button)
  - About (version info)
- ✅ Environment badge shows current state
- ✅ Switching environment updates navbar immediately
- ✅ Success toast appears
- ✅ Refresh cache shows loading spinner then success toast

**What to Check**:
- Environment persists in localStorage
- X-Environment header changes in Network tab
- Subsequent API calls use new environment
- Cache refresh makes calls to all reference endpoints

---

### 11. Responsive Design
**Steps**:
1. Resize browser window to mobile width (< 768px)
2. Check that sidebar becomes hamburger menu
3. Resize to tablet width (768px - 1024px)
4. Resize to desktop width (> 1024px)

**Expected Results**:
- ✅ Mobile: Sidebar collapses to hamburger icon
- ✅ Mobile: Tables scroll horizontally or stack
- ✅ Tablet: Layout adjusts appropriately
- ✅ Desktop: Full sidebar visible, optimal layout

---

### 12. Error Handling
**Steps**:
1. Stop the backend server (`Ctrl+C` in backend terminal)
2. Try searching for patients
3. Check error toast notification
4. Restart backend server

**Expected Results**:
- ✅ User-friendly error toast appears: "Failed to search patients"
- ✅ No app crash
- ✅ Loading states clear
- ✅ After backend restart, functionality resumes

---

## Common Issues & Solutions

### Issue: "Network Error" in console
**Solution**: Ensure backend is running on port 3001
```bash
cd backend && npm start
```

### Issue: "CORS Error"
**Solution**: Backend should have CORS enabled. Check backend logs.

### Issue: Blank page or white screen
**Solution**: Check browser console for errors. Likely a JavaScript error. Check that all dependencies are installed:
```bash
cd frontend && npm install
```

### Issue: Data not loading
**Solution**:
1. Check Network tab - are API calls being made?
2. Check API calls have `X-Environment: sandbox` header
3. Verify backend is connected to Cloud9 API

### Issue: Form validation not working
**Solution**: Check that Zod schemas are properly defined in `utils/validation.ts`

---

## Testing Report Template

After testing, document your findings:

```markdown
## Test Results - [Date]

### Working Features
- [ ] Dashboard loads
- [ ] Patient search
- [ ] Patient details
- [ ] Edit patient
- [ ] Create patient
- [ ] Appointment list
- [ ] Appointment calendar
- [ ] Schedule appointment
- [ ] Confirm/Cancel appointments
- [ ] Settings/Environment switch
- [ ] Responsive design

### Issues Found
1. [Description of issue]
   - Steps to reproduce
   - Expected vs Actual behavior
   - Severity: Critical / High / Medium / Low

### Browser Tested
- Browser: [Chrome/Firefox/Safari]
- Version: [X.X]
- OS: [Windows/Mac/Linux]

### Network Performance
- Average API response time: [X]ms
- Page load time: [X]s
- Any slow endpoints: [list]
```

---

## Next Steps After Testing

1. Document any bugs found
2. Test cross-browser compatibility (Chrome, Firefox, Safari)
3. Test on mobile devices
4. Verify accessibility with screen reader
5. Test keyboard navigation (Tab, Enter, Esc)
