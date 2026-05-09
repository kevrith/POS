# Quick Test Commands

## 🚀 Start Testing Now!

### Mobile App (Print Receipt)
```bash
cd apps/mobile-driver
npx expo start

# Then press:
# 'i' for iOS simulator
# 'a' for Android emulator
# Or scan QR code with Expo Go app
```

### Web App (Generate Invoice)
```bash
cd apps/web
pnpm dev

# Open: http://localhost:3001/field-orders
```

### API (Backend)
```bash
cd apps/api
npm run start:dev

# Runs on: http://localhost:3010
```

---

## ✅ What to Test

### Mobile App - 5 Steps
1. Launch app
2. Go to Deliveries tab
3. Select a delivery
4. Mark as DELIVERED
5. **Tap "Print Receipt" button** ← NEW!

### Web App - 3 Steps
1. Open Field Orders page
2. Click on DELIVERED order
3. **Click "Generate Invoice"** ← Already works!

---

## 📱 Expected Results

### Mobile App
✅ "Print Receipt" button appears
✅ Native print dialog opens
✅ Receipt shows all details
✅ Can print or save as PDF

### Web App
✅ Invoice generated successfully
✅ Customer notified (WhatsApp/SMS)
✅ Invoice appears in Proformas
✅ Can download PDF

---

## 🐛 If Something Breaks

### Mobile App
```bash
# Clear cache and restart
npx expo start -c

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

### Web App
```bash
# Check browser console (F12)
# Verify API is running on port 3010
# Check user permissions
```

---

## 📊 Quick Status

✅ Code pushed to GitHub
✅ Dependencies installed
✅ API build successful
✅ TypeScript errors fixed
✅ Ready to test!

---

## 🎯 Test Priority

### High Priority
1. ✅ Mobile: Print Receipt button appears
2. ✅ Mobile: Print dialog opens
3. ✅ Web: Generate Invoice works

### Medium Priority
4. ✅ Mobile: Receipt formatting correct
5. ✅ Web: Bulk invoice works
6. ✅ Web: Payment recording works

### Low Priority
7. ✅ Mobile: Works on physical device
8. ✅ Web: PDF download works
9. ✅ Edge cases and error handling

---

## 📞 Quick Help

### Mobile App Not Starting?
```bash
# Check Expo version
npx expo --version

# Update Expo if needed
npx expo install expo@latest
```

### Web App Not Loading?
```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill process if needed
kill -9 <PID>
```

### API Not Running?
```bash
# Check if port 3010 is in use
lsof -i :3010

# Check database connection
psql -U kastra -d kastra_pos -c "SELECT 1"
```

---

## 🎉 Success Indicators

### Mobile App
- ✅ No red error screens
- ✅ Print button visible
- ✅ Print dialog opens smoothly
- ✅ Receipt looks professional

### Web App
- ✅ No console errors
- ✅ Invoice number generated
- ✅ Success toast appears
- ✅ Invoice in Proformas list

---

**Start Testing! 🚀**

Run: `cd apps/mobile-driver && npx expo start`
