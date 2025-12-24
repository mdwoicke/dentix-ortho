# Quick Start - Testing the Cloud 9 Ortho CRM

## Current Status
✅ **Backend**: Running on http://localhost:3001
✅ **Frontend**: Running on http://localhost:5174

## 🚀 Start Testing Now

### 1. Open the Dashboard
**URL**: http://localhost:5174

**What you'll see**:
- Navigation sidebar on the left
- "Cloud 9 Ortho CRM" title at top
- Yellow "Sandbox" badge (shows current environment)
- Three quick action cards
- "Upcoming Appointments" section (auto-loads appointments for next 7 days)

### 2. Search for Patients
**URL**: http://localhost:5174/patients

**Quick Test**:
1. Type "John" in the First Name field
2. Click "Search"
3. You should see ~25 patients with "Johns" in their name
4. Click "View Details" on any patient

### 3. View Patient Details
After clicking "View Details", you'll see:
- Patient information card
- Edit Patient button
- Schedule Appointment button
- List of patient's appointments below

**Quick Test**:
- Click "Edit Patient" - modal opens with form
- Change the phone number
- Click "Update Patient"
- Success toast should appear!

### 4. View Calendar
**URL**: http://localhost:5174/calendar

**What you'll see**:
- Full calendar with appointments
- Month/Week/Day view buttons
- Click any appointment to see details
- Click empty slot to schedule new appointment

### 5. Switch Environment
**URL**: http://localhost:5174/settings

**Quick Test**:
1. Click "Settings" in sidebar
2. Current environment shows "Sandbox" (yellow badge)
3. Click "Switch to Production"
4. Badge changes to "Production" (green)
5. All subsequent API calls will use production environment
6. Switch back to Sandbox for testing

---

## 🧪 Quick Feature Tests

### Test Patient Search
```
1. Go to: http://localhost:5174/patients
2. Enter "Smith" in Last Name
3. Click Search
4. Results should appear in table
```

### Test Appointments
```
1. Go to: http://localhost:5174/appointments
2. Appointment list loads automatically
3. Try filtering by date range
4. Click Confirm/Cancel on appointments
```

### Test Responsive Design
```
1. Resize browser to mobile width (< 768px)
2. Sidebar should collapse to hamburger menu
3. Click hamburger to open/close menu
```

---

## 🐛 Troubleshooting

### Frontend not loading?
Check the terminal where you ran `npm run dev` from the frontend folder.
Look for "ready in XXms" message.

### API calls failing?
1. Open browser DevTools (F12)
2. Go to Network tab
3. Look for failed requests (red)
4. Check backend terminal for errors

### No data showing?
1. Verify backend is running: http://localhost:3001/health
2. Should return: `{"status":"ok","timestamp":"..."}`
3. Check X-Environment header is being sent (see Network tab)

---

## 📋 Test Checklist

Quick checklist to verify all features:

- [ ] Dashboard loads
- [ ] Can search patients
- [ ] Can view patient details
- [ ] Can edit patient (form validation works)
- [ ] Can create new patient
- [ ] Appointment list loads
- [ ] Calendar view works
- [ ] Can schedule appointment
- [ ] Can confirm appointment
- [ ] Can cancel appointment
- [ ] Environment switch works
- [ ] Toast notifications appear
- [ ] Sidebar navigation works
- [ ] Responsive on mobile

---

## 🎯 Key URLs

| Page | URL |
|------|-----|
| Dashboard | http://localhost:5174 |
| Patients | http://localhost:5174/patients |
| Appointments | http://localhost:5174/appointments |
| Calendar | http://localhost:5174/calendar |
| Settings | http://localhost:5174/settings |
| API Health | http://localhost:3001/health |

---

## 💡 Tips

1. **Check Browser Console**: Press F12 and look at Console tab for any errors
2. **Check Network Tab**: See all API calls being made and their responses
3. **Use Sandbox Environment**: Start with sandbox data (test data) before switching to production
4. **Toast Notifications**: Success/error messages appear in top-right corner
5. **Loading States**: Buttons show spinner while processing

---

## 📚 Full Testing Guide

For comprehensive testing instructions, see: [MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md)

---

## ⚡ Quick API Test (via curl)

Test backend directly:

```bash
# Health check
curl http://localhost:3001/health

# Search patients (sandbox)
curl -H "X-Environment: sandbox" \
  "http://localhost:3001/api/patients/search?query=John"

# Get locations
curl -H "X-Environment: sandbox" \
  http://localhost:3001/api/reference/locations
```

All endpoints should return JSON with `status: "success"`.

---

## 🎉 What's Working

✅ All 14 backend API endpoints
✅ Patient search, create, update
✅ Appointment list, create, confirm, cancel
✅ Reference data (locations, appointment types, providers)
✅ Environment switching (sandbox/production)
✅ Form validation with Zod
✅ Redux state management
✅ React Router navigation
✅ FullCalendar integration
✅ Toast notifications
✅ Responsive layout

---

**Ready to test?** Open http://localhost:5174 in your browser and start exploring! 🚀
