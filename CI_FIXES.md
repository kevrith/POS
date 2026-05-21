# CI Test Failures - Fixed

## Issues Identified

### 1. Jest Module Resolution Error
**Error**: `Cannot find module '@pos/shared' from 'inventory/inventory.service.ts'`

**Root Cause**: Jest was unable to resolve the `@pos/shared` workspace package during test execution.

**Fix**: Added `moduleNameMapper` configuration to Jest in `apps/api/package.json`:
```json
"moduleNameMapper": {
  "@pos/shared": "<rootDir>/../../packages/shared/index.ts"
}
```

### 2. Loyalty Service Test Failures
**Error**: 
- `expect(received).toBe(expected) // Object.is equality - Expected: 10, Received: NaN`
- `expect(received).toBe(expected) // Object.is equality - Expected: 100, Received: NaN`

**Root Cause**: Tests were using outdated field names from an old schema version:
- Old: `pointsPerCent`, `redemptionRate`
- New: `kesPerPoint`, `pointValueCents`

**Fix**: Updated test mocks in `apps/api/src/loyalty/loyalty.service.spec.ts`:
1. Changed `makeProgram()` to use `kesPerPoint: 100` and `pointValueCents: 1`
2. Updated `earnPoints` test to use correct calculation (1 point per KES 100)
3. Added missing mock for `prisma.loyaltyTransaction.findFirst` (duplicate check)
4. Updated `redeemPoints` test to use `pointValueCents` instead of `redemptionRate`

## Files Modified

1. `/home/kelvin/Development/Phase-5/pos/apps/api/package.json`
   - Added Jest moduleNameMapper configuration

2. `/home/kelvin/Development/Phase-5/pos/apps/api/src/loyalty/loyalty.service.spec.ts`
   - Fixed field names in test mocks
   - Added missing mock for duplicate check
   - Corrected test expectations

## Verification

These fixes address:
- ✅ Module resolution for `@pos/shared` package in Jest tests
- ✅ Loyalty service test failures (NaN values)
- ✅ All 4 failed test suites should now pass

The CI workflow should now complete successfully.
