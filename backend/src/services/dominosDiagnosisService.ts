import axios from 'axios';
import logger from '../utils/logger';
import type { DominosOrderLogRow } from '../models/DominosOrderLog';

// ============================================================================
// TYPES
// ============================================================================

type ErrorCategory =
  | 'INVALID_MENU_ITEM' | 'INVALID_COUPON' | 'SERVICE_METHOD_ERROR'
  | 'STORE_CLOSED' | 'TIMEOUT' | 'CODE_BUG' | 'INPUT_VALIDATION'
  | 'ADDRESS_ERROR' | 'OTHER';

interface InvestigationCheck {
  name: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'error';
  detail: string;
}

interface ProblematicItem {
  code: string;
  reason: string;
  alternatives: string[];
}

interface ReplayResult {
  performed: boolean;
  success: boolean;
  sameError: boolean;
  statusCode: number;
  errorMessage: string | null;
  responseTimeMs: number;
}

interface FixChange {
  field: string;
  from: string;
  to: string;
}

interface FixProposal {
  description: string;
  changes: FixChange[];
  testResult: {
    performed: boolean;
    success: boolean;
    statusCode: number;
    responseTimeMs: number;
    note: string;
  };
}

interface DiagnosisResult {
  logId: number;
  category: ErrorCategory;
  categoryLabel: string;
  confidence: number;
  rootCause: string;
  explanation: string;
  investigation: {
    checksPerformed: InvestigationCheck[];
    problematicItems: ProblematicItem[];
  };
  replay: ReplayResult;
  fixProposal: FixProposal | null;
  resolution: string[];
  diagnosedAt: string;
  durationMs: number;
}

interface DiagnoseOptions {
  skipReplay?: boolean;
  skipFixTest?: boolean;
}

// ============================================================================
// CATEGORY LABELS
// ============================================================================

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  INVALID_MENU_ITEM: 'Invalid Menu Item',
  INVALID_COUPON: 'Invalid Coupon',
  SERVICE_METHOD_ERROR: 'Service Method Error',
  STORE_CLOSED: 'Store Closed',
  TIMEOUT: 'Timeout',
  CODE_BUG: 'Code Bug',
  INPUT_VALIDATION: 'Input Validation',
  ADDRESS_ERROR: 'Address Error',
  OTHER: 'Other',
};

// ============================================================================
// IN-MEMORY CACHE (menu/coupon data per store, 5 min TTL)
// ============================================================================

const dataCache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key: string): any | null {
  const entry = dataCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  dataCache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  dataCache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// ============================================================================
// HELPERS
// ============================================================================

function tryParseJSON(str: string | null | undefined): any {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function extractProductCodes(requestBody: any): { code: string; categoryCode: string }[] {
  if (!requestBody) return [];
  const products = requestBody.orderDataBody?.cart?.products || [];
  return products.map((p: any) => ({
    code: p.Code || p.code || '',
    categoryCode: p.CategoryCode || p.categoryCode || '',
  })).filter((p: any) => p.code);
}

function extractCouponCode(requestBody: any): string | null {
  if (!requestBody) return null;
  return requestBody.orderDataBody?.coupon_code
    || requestBody.orderDataBody?.cart?.couponCode
    || null;
}

function extractStoreId(requestBody: any, log: DominosOrderLogRow): string | null {
  if (!requestBody) return log.store_id;
  return requestBody.orderDataBody?.storeID
    || requestBody.orderDataBody?.store_number
    || requestBody.orderDataBody?.cart?.storeId
    || log.store_id;
}

function extractServiceMethod(requestBody: any): string | null {
  if (!requestBody) return null;
  return requestBody.orderDataBody?.cart?.orderType
    || requestBody.orderDataBody?.serviceMethod
    || null;
}

// ============================================================================
// STAGE 1: CATEGORIZE
// ============================================================================

function categorize(log: DominosOrderLogRow, responseObj: any): { category: ErrorCategory; confidence: number; detail: string } {
  const errorText = (log.error_message || '') + ' ' + (log.error_stack || '');
  const responseText = log.response_body || '';
  const combined = errorText + ' ' + responseText;

  // Check for Dominos-specific error codes in response
  const dominosErrors: string[] = [];
  if (responseObj?.dominosErrors) {
    for (const e of responseObj.dominosErrors) {
      dominosErrors.push(`${e.Code}: ${e.Message || ''}`);
    }
  }

  if (combined.includes('PickAlternateProduct') || combined.includes('PosInvalidOrderItem')) {
    return { category: 'INVALID_MENU_ITEM', confidence: 95, detail: 'Dominos API rejected product — PosInvalidOrderItem / PickAlternateProduct' };
  }
  if (combined.includes('InvalidCouponsFound') || combined.includes('CouponNotFound')) {
    return { category: 'INVALID_COUPON', confidence: 95, detail: 'Coupon code not recognized or incompatible with items' };
  }
  if (combined.includes('ServiceMethodNotAllowed')) {
    return { category: 'SERVICE_METHOD_ERROR', confidence: 90, detail: 'Delivery/carryout method not available at this store' };
  }
  if (combined.includes('StoreClosed') || combined.includes('StoreNotOpen')) {
    return { category: 'STORE_CLOSED', confidence: 95, detail: 'Store was closed at time of order' };
  }
  if (/timed?\s*out|timeout|ECONNABORTED/i.test(combined)) {
    return { category: 'TIMEOUT', confidence: 80, detail: 'Request timed out' };
  }
  if (combined.includes('formatted') || combined.includes('fallback is not a function')) {
    return { category: 'CODE_BUG', confidence: 90, detail: 'Internal code bug' };
  }
  if (combined.includes('validation_failed') || /ZodError|invalid_type|invalid_string/.test(combined)) {
    return { category: 'INPUT_VALIDATION', confidence: 85, detail: 'Request body failed schema validation' };
  }
  if (combined.includes('InvalidAddress') || combined.includes('AddressNotDeliverable')) {
    return { category: 'ADDRESS_ERROR', confidence: 90, detail: 'Address validation failed' };
  }

  // Check Dominos error codes
  const dominosJoined = dominosErrors.join(' ');
  if (dominosJoined.includes('PickAlternateProduct') || dominosJoined.includes('PosInvalidOrderItem')) {
    return { category: 'INVALID_MENU_ITEM', confidence: 90, detail: dominosErrors[0] };
  }
  if (dominosJoined.includes('InvalidCoupon')) {
    return { category: 'INVALID_COUPON', confidence: 90, detail: dominosErrors[0] };
  }

  return { category: 'OTHER', confidence: 50, detail: (log.error_message || 'Unknown error').substring(0, 200) };
}

// ============================================================================
// STAGE 2: INVESTIGATE
// ============================================================================

async function fetchMenu(serviceUrl: string, storeId: string): Promise<any> {
  const cacheKey = `menu:${storeId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${serviceUrl}/api/v1/direct-order/menu/${storeId}`;
  const { data } = await axios.get(url, { timeout: 30000 });
  const menu = data.menu || data.data || data;
  setCache(cacheKey, menu);
  return menu;
}

async function fetchCoupons(serviceUrl: string, storeId: string): Promise<any> {
  const cacheKey = `coupons:${storeId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${serviceUrl}/api/v1/direct-order/coupons/${storeId}`;
  const { data } = await axios.get(url, { timeout: 30000 });
  const coupons = data.coupons || data.data || data;
  setCache(cacheKey, coupons);
  return coupons;
}

async function fetchStoreProfile(storeId: string): Promise<any> {
  const cacheKey = `store:${storeId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const { data } = await axios.get(
    `https://order.dominos.com/power/store/${storeId}/profile`,
    { timeout: 15000, headers: { Accept: 'application/json' } }
  );
  setCache(cacheKey, data);
  return data;
}

async function investigate(
  category: ErrorCategory,
  log: DominosOrderLogRow,
  requestBody: any,
  responseObj: any,
  serviceUrl: string
): Promise<{ checks: InvestigationCheck[]; problematicItems: ProblematicItem[] }> {
  const checks: InvestigationCheck[] = [];
  const problematicItems: ProblematicItem[] = [];
  const storeId = extractStoreId(requestBody, log);

  if (!storeId) {
    checks.push({ name: 'store_id_check', label: 'Store ID', status: 'warn', detail: 'Could not determine store ID from request' });
    return { checks, problematicItems };
  }

  switch (category) {
    case 'INVALID_MENU_ITEM': {
      const products = extractProductCodes(requestBody);
      if (products.length === 0) {
        checks.push({ name: 'menu_product_check', label: 'Product Availability', status: 'skip', detail: 'No product codes found in request' });
        break;
      }

      try {
        const menu = await fetchMenu(serviceUrl, storeId);
        const menuProducts = menu?.Products || {};
        const variants = menu?.Variants || {};

        for (const prod of products) {
          const menuProduct = menuProducts[prod.code];
          if (!menuProduct) {
            // Product code not in menu at all - check if it's a variant code
            if (variants[prod.code]) {
              const isAvailable = variants[prod.code].Prepared === true;
              if (!isAvailable) {
                problematicItems.push({ code: prod.code, reason: 'variant_unavailable', alternatives: [] });
                checks.push({ name: `product_${prod.code}`, label: `Product ${prod.code}`, status: 'fail', detail: `Variant ${prod.code} exists but is not available (Prepared=false)` });
              } else {
                checks.push({ name: `product_${prod.code}`, label: `Product ${prod.code}`, status: 'pass', detail: `Variant ${prod.code} is available` });
              }
            } else {
              // Find alternatives in same category
              const alts: string[] = [];
              for (const [code, p] of Object.entries(menuProducts as Record<string, any>)) {
                if ((p.ProductType || p.Category) === prod.categoryCode && code !== prod.code) {
                  const pVariants: string[] = Array.isArray(p.Variants) ? p.Variants : [];
                  const available = pVariants.some((vc: string) => variants[vc]?.Prepared === true);
                  if (available && alts.length < 3) alts.push(code);
                }
              }
              problematicItems.push({ code: prod.code, reason: 'not_in_menu', alternatives: alts });
              checks.push({ name: `product_${prod.code}`, label: `Product ${prod.code}`, status: 'fail', detail: `Product code ${prod.code} not found in store ${storeId} menu` });
            }
          } else {
            // Product exists - check variant availability
            const pVariants: string[] = Array.isArray(menuProduct.Variants) ? menuProduct.Variants : [];
            const anyAvailable = pVariants.length === 0 || pVariants.some((vc: string) => variants[vc]?.Prepared === true);
            if (anyAvailable) {
              checks.push({ name: `product_${prod.code}`, label: `Product ${prod.code}`, status: 'pass', detail: `Product ${prod.code} (${menuProduct.Name}) is available` });
            } else {
              const alts: string[] = [];
              for (const [code, p] of Object.entries(menuProducts as Record<string, any>)) {
                if ((p.ProductType || p.Category) === (menuProduct.ProductType || menuProduct.Category) && code !== prod.code) {
                  const pvars: string[] = Array.isArray(p.Variants) ? p.Variants : [];
                  if (pvars.some((vc: string) => variants[vc]?.Prepared === true) && alts.length < 3) alts.push(code);
                }
              }
              problematicItems.push({ code: prod.code, reason: 'not_available', alternatives: alts });
              checks.push({ name: `product_${prod.code}`, label: `Product ${prod.code}`, status: 'fail', detail: `Product ${prod.code} exists but no variants are available (Prepared=false)` });
            }
          }
        }
      } catch (err: any) {
        checks.push({ name: 'menu_product_check', label: 'Product Availability', status: 'error', detail: `Failed to fetch menu: ${err.message}` });
      }
      break;
    }

    case 'INVALID_COUPON': {
      const couponCode = extractCouponCode(requestBody);
      if (!couponCode) {
        checks.push({ name: 'coupon_check', label: 'Coupon Validity', status: 'skip', detail: 'No coupon code found in request' });
        break;
      }

      try {
        const couponsData = await fetchCoupons(serviceUrl, storeId);
        // Coupons can be an array or object keyed by code
        let found = false;
        if (Array.isArray(couponsData)) {
          found = couponsData.some((c: any) => (c.Code || c.code) === couponCode);
        } else if (couponsData && typeof couponsData === 'object') {
          const couponsObj = couponsData.Coupons || couponsData;
          found = !!couponsObj[couponCode];
        }

        if (found) {
          checks.push({ name: 'coupon_exists', label: 'Coupon Exists', status: 'pass', detail: `Coupon ${couponCode} found in store ${storeId}` });
          // Check service method compatibility
          const svcMethod = extractServiceMethod(requestBody);
          if (svcMethod) {
            checks.push({ name: 'coupon_svc_method', label: 'Coupon Service Method', status: 'warn', detail: `Coupon may not be compatible with ${svcMethod} orders` });
          }
        } else {
          problematicItems.push({ code: couponCode, reason: 'coupon_not_found', alternatives: [] });
          checks.push({ name: 'coupon_exists', label: 'Coupon Exists', status: 'fail', detail: `Coupon ${couponCode} not found in store ${storeId} coupon list` });
        }
      } catch (err: any) {
        checks.push({ name: 'coupon_check', label: 'Coupon Validity', status: 'error', detail: `Failed to fetch coupons: ${err.message}` });
      }
      break;
    }

    case 'SERVICE_METHOD_ERROR': {
      try {
        const storeProfile = await fetchStoreProfile(storeId);
        const allowDelivery = storeProfile.AllowDeliveryOrders;
        const allowCarryout = storeProfile.AllowCarryoutOrders;
        const svcMethod = extractServiceMethod(requestBody);

        checks.push({
          name: 'store_delivery',
          label: 'Delivery Available',
          status: allowDelivery ? 'pass' : 'fail',
          detail: allowDelivery ? 'Store accepts delivery orders' : 'Store does NOT accept delivery orders',
        });
        checks.push({
          name: 'store_carryout',
          label: 'Carryout Available',
          status: allowCarryout ? 'pass' : 'fail',
          detail: allowCarryout ? 'Store accepts carryout orders' : 'Store does NOT accept carryout orders',
        });

        if (svcMethod) {
          const methodAllowed = svcMethod.toLowerCase().includes('deliver') ? allowDelivery : allowCarryout;
          if (!methodAllowed) {
            const alt = svcMethod.toLowerCase().includes('deliver') ? 'Carryout' : 'Delivery';
            problematicItems.push({ code: svcMethod, reason: 'method_not_allowed', alternatives: [alt] });
          }
        }
      } catch (err: any) {
        checks.push({ name: 'store_service_check', label: 'Store Service Methods', status: 'error', detail: `Failed to fetch store profile: ${err.message}` });
      }
      break;
    }

    case 'STORE_CLOSED': {
      try {
        const storeProfile = await fetchStoreProfile(storeId);
        const isOpen = storeProfile.IsOpen;
        const hours = storeProfile.HoursDescription || storeProfile.ServiceHoursDescription || 'N/A';

        checks.push({
          name: 'store_open',
          label: 'Store Open Now',
          status: isOpen ? 'pass' : 'fail',
          detail: isOpen ? 'Store is currently open' : 'Store is currently CLOSED',
        });
        checks.push({
          name: 'store_hours',
          label: 'Store Hours',
          status: 'pass',
          detail: typeof hours === 'object' ? JSON.stringify(hours) : String(hours),
        });
      } catch (err: any) {
        checks.push({ name: 'store_status_check', label: 'Store Status', status: 'error', detail: `Failed to fetch store profile: ${err.message}` });
      }
      break;
    }

    case 'TIMEOUT': {
      checks.push({
        name: 'original_response_time',
        label: 'Original Response Time',
        status: log.response_time_ms > 30000 ? 'fail' : 'warn',
        detail: `Original request took ${log.response_time_ms}ms`,
      });
      const products = extractProductCodes(requestBody);
      checks.push({
        name: 'request_complexity',
        label: 'Request Complexity',
        status: products.length > 5 ? 'warn' : 'pass',
        detail: `Order contains ${products.length} product(s)`,
      });
      break;
    }

    case 'CODE_BUG': {
      const stack = log.error_stack || log.error_message || '';
      if (stack.includes('formatted')) {
        checks.push({ name: 'bug_formatted', label: 'Formatted Setter Bug', status: 'fail', detail: 'Known bug: coupon monkey-patch issue causes "formatted" error on undefined' });
      } else if (stack.includes('fallback is not a function')) {
        checks.push({ name: 'bug_fallback', label: 'Fallback Function Bug', status: 'fail', detail: 'Known bug: fallback function not defined' });
      } else {
        checks.push({ name: 'bug_unknown', label: 'Unknown Code Bug', status: 'fail', detail: `Error stack: ${stack.substring(0, 200)}` });
      }
      break;
    }

    case 'INPUT_VALIDATION': {
      // Try to parse Zod errors from response
      if (responseObj?.errors) {
        const zodErrors = Array.isArray(responseObj.errors) ? responseObj.errors : [responseObj.errors];
        for (const ze of zodErrors) {
          const path = ze.path?.join('.') || ze.field || 'unknown';
          checks.push({
            name: `validation_${path}`,
            label: `Field: ${path}`,
            status: 'fail',
            detail: ze.message || ze.code || 'Validation failed',
          });
        }
      } else {
        checks.push({ name: 'validation_generic', label: 'Validation Error', status: 'fail', detail: log.error_message || 'Request body failed schema validation' });
      }
      break;
    }

    case 'ADDRESS_ERROR': {
      const addr = requestBody?.orderDataBody?.customer?.address || requestBody?.orderDataBody?.address;
      if (addr) {
        const street = addr.Street || addr.street || 'N/A';
        const city = addr.City || addr.city || 'N/A';
        const zip = addr.PostalCode || addr.zip || 'N/A';
        checks.push({ name: 'address_info', label: 'Address Submitted', status: 'fail', detail: `${street}, ${city}, ${zip}` });
      } else {
        checks.push({ name: 'address_missing', label: 'Address', status: 'fail', detail: 'No address found in request body' });
      }
      break;
    }

    default: {
      checks.push({ name: 'generic_check', label: 'Error Analysis', status: 'warn', detail: log.error_message || 'Unable to determine specific cause' });
      break;
    }
  }

  return { checks, problematicItems };
}

// ============================================================================
// STAGE 3: REPLAY
// ============================================================================

async function replay(
  requestBody: any,
  serviceUrl: string
): Promise<ReplayResult> {
  const url = `${serviceUrl}/api/v1/direct-order`;
  const start = Date.now();

  try {
    const response = await axios.post(url, requestBody, {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true, // Accept any status code
    });
    const elapsed = Date.now() - start;
    const isSuccess = response.status >= 200 && response.status < 300
      && response.data?.success !== false;

    return {
      performed: true,
      success: isSuccess,
      sameError: !isSuccess, // Simplified - could do deeper comparison
      statusCode: response.status,
      errorMessage: isSuccess ? null : (response.data?.error || response.data?.message || null),
      responseTimeMs: elapsed,
    };
  } catch (err: any) {
    const elapsed = Date.now() - start;
    return {
      performed: true,
      success: false,
      sameError: true,
      statusCode: err.response?.status || 0,
      errorMessage: err.message,
      responseTimeMs: elapsed,
    };
  }
}

// ============================================================================
// STAGE 4: FIX AND TEST
// ============================================================================

async function fixAndTest(
  category: ErrorCategory,
  requestBody: any,
  problematicItems: ProblematicItem[],
  serviceUrl: string
): Promise<FixProposal | null> {
  if (!requestBody) return null;

  const clonedBody = JSON.parse(JSON.stringify(requestBody));
  const changes: FixChange[] = [];
  let description = '';

  switch (category) {
    case 'INVALID_MENU_ITEM': {
      const products = clonedBody.orderDataBody?.cart?.products;
      if (!Array.isArray(products)) return null;

      let anyFixed = false;
      for (const item of problematicItems) {
        if (item.alternatives.length === 0) continue;
        const alt = item.alternatives[0];
        const idx = products.findIndex((p: any) => (p.Code || p.code) === item.code);
        if (idx >= 0) {
          const field = `products[${idx}].Code`;
          changes.push({ field, from: item.code, to: alt });
          if (products[idx].Code) products[idx].Code = alt;
          else products[idx].code = alt;
          anyFixed = true;
        }
      }

      if (!anyFixed) return null;
      description = `Replace unavailable product codes with alternatives`;
      break;
    }

    case 'INVALID_COUPON': {
      const couponCode = extractCouponCode(clonedBody);
      if (!couponCode) return null;

      // Remove coupon from request
      if (clonedBody.orderDataBody?.coupon_code) {
        changes.push({ field: 'orderDataBody.coupon_code', from: couponCode, to: '(removed)' });
        delete clonedBody.orderDataBody.coupon_code;
      }
      if (clonedBody.orderDataBody?.cart?.couponCode) {
        changes.push({ field: 'orderDataBody.cart.couponCode', from: couponCode, to: '(removed)' });
        delete clonedBody.orderDataBody.cart.couponCode;
      }

      if (changes.length === 0) return null;
      description = `Remove invalid coupon code ${couponCode}`;
      break;
    }

    case 'SERVICE_METHOD_ERROR': {
      const svcMethod = extractServiceMethod(clonedBody);
      if (!svcMethod) return null;

      const alt = svcMethod.toLowerCase().includes('deliver') ? 'Carryout' : 'Delivery';
      if (clonedBody.orderDataBody?.cart?.orderType) {
        changes.push({ field: 'orderDataBody.cart.orderType', from: svcMethod, to: alt });
        clonedBody.orderDataBody.cart.orderType = alt;
      } else if (clonedBody.orderDataBody?.serviceMethod) {
        changes.push({ field: 'orderDataBody.serviceMethod', from: svcMethod, to: alt });
        clonedBody.orderDataBody.serviceMethod = alt;
      } else {
        return null;
      }

      description = `Switch service method from ${svcMethod} to ${alt}`;
      break;
    }

    // Categories with no automated fix
    case 'STORE_CLOSED':
    case 'CODE_BUG':
    case 'INPUT_VALIDATION':
    case 'ADDRESS_ERROR':
    case 'TIMEOUT':
    case 'OTHER':
    default:
      return null;
  }

  // Test the fix
  const url = `${serviceUrl}/api/v1/direct-order`;
  const start = Date.now();
  try {
    const response = await axios.post(url, clonedBody, {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    const elapsed = Date.now() - start;
    const isSuccess = response.status >= 200 && response.status < 300
      && response.data?.success !== false;

    return {
      description,
      changes,
      testResult: {
        performed: true,
        success: isSuccess,
        statusCode: response.status,
        responseTimeMs: elapsed,
        note: isSuccess ? 'Fixed order passed validation' : `Fix did not resolve: ${response.data?.error || response.status}`,
      },
    };
  } catch (err: any) {
    const elapsed = Date.now() - start;
    return {
      description,
      changes,
      testResult: {
        performed: true,
        success: false,
        statusCode: err.response?.status || 0,
        responseTimeMs: elapsed,
        note: `Fix test failed: ${err.message}`,
      },
    };
  }
}

// ============================================================================
// BUILD RESOLUTION STEPS
// ============================================================================

function buildResolution(category: ErrorCategory, problematicItems: ProblematicItem[], fixProposal: FixProposal | null): string[] {
  const steps: string[] = [];

  switch (category) {
    case 'INVALID_MENU_ITEM':
      for (const item of problematicItems) {
        if (item.alternatives.length > 0) {
          steps.push(`Replace product code ${item.code} with ${item.alternatives[0]}`);
        } else {
          steps.push(`Remove unavailable product ${item.code} from the order`);
        }
      }
      steps.push('Add menu pre-check to ordering flow to validate items before submission');
      break;
    case 'INVALID_COUPON':
      steps.push('Remove or replace the invalid coupon code');
      steps.push('Add coupon validation before order submission');
      break;
    case 'SERVICE_METHOD_ERROR':
      steps.push('Check store capabilities before selecting delivery/carryout');
      if (fixProposal?.changes[0]) {
        steps.push(`Switch to ${fixProposal.changes[0].to} if available`);
      }
      break;
    case 'STORE_CLOSED':
      steps.push('Retry when the store is open');
      steps.push('Add store hours check before order submission');
      break;
    case 'TIMEOUT':
      steps.push('Retry the order (transient issue)');
      steps.push('Simplify order if it has many items');
      break;
    case 'CODE_BUG':
      steps.push('Report bug to development team');
      steps.push('Deploy fix to Dominos order service');
      break;
    case 'INPUT_VALIDATION':
      steps.push('Fix the invalid fields in the order request');
      steps.push('Ensure order builder produces valid schema');
      break;
    case 'ADDRESS_ERROR':
      steps.push('Verify the delivery address is correct and within the store delivery area');
      break;
    default:
      steps.push('Review the error details and retry if appropriate');
      break;
  }

  return steps;
}

// ============================================================================
// MAIN DIAGNOSE FUNCTION
// ============================================================================

export async function diagnose(
  log: DominosOrderLogRow,
  serviceUrl: string,
  options: DiagnoseOptions = {}
): Promise<DiagnosisResult> {
  const startTime = Date.now();

  const requestBody = tryParseJSON(log.request_body);
  const responseObj = tryParseJSON(log.response_body);

  // Stage 1: Categorize
  const { category, confidence, detail } = categorize(log, responseObj);

  // Stage 2: Investigate
  let checks: InvestigationCheck[] = [];
  let problematicItems: ProblematicItem[] = [];
  try {
    const investigation = await investigate(category, log, requestBody, responseObj, serviceUrl);
    checks = investigation.checks;
    problematicItems = investigation.problematicItems;
  } catch (err: any) {
    logger.warn('Diagnosis investigation failed', { error: err.message });
    checks.push({ name: 'investigation_error', label: 'Investigation', status: 'error', detail: `Investigation failed: ${err.message}` });
  }

  // Stage 3: Replay
  let replayResult: ReplayResult = {
    performed: false, success: false, sameError: false,
    statusCode: 0, errorMessage: null, responseTimeMs: 0,
  };
  if (!options.skipReplay && requestBody) {
    try {
      replayResult = await replay(requestBody, serviceUrl);
    } catch (err: any) {
      logger.warn('Diagnosis replay failed', { error: err.message });
      replayResult = {
        performed: true, success: false, sameError: true,
        statusCode: 0, errorMessage: err.message, responseTimeMs: 0,
      };
    }
  }

  // Stage 4: Fix and Test
  let fixProposal: FixProposal | null = null;
  if (!options.skipFixTest && requestBody && problematicItems.length > 0) {
    try {
      fixProposal = await fixAndTest(category, requestBody, problematicItems, serviceUrl);
    } catch (err: any) {
      logger.warn('Diagnosis fix-and-test failed', { error: err.message });
    }
  }

  // Build resolution steps
  const resolution = buildResolution(category, problematicItems, fixProposal);

  // Build explanation
  const storeId = extractStoreId(requestBody, log);
  let rootCause = detail;
  let explanation = `The order to store #${storeId || 'unknown'} failed with category ${CATEGORY_LABELS[category]}.`;

  if (problematicItems.length > 0) {
    const itemSummary = problematicItems.map(i => `${i.code} (${i.reason})`).join(', ');
    rootCause = `${detail}: ${itemSummary}`;
    explanation += ` Problematic items: ${itemSummary}.`;
  }

  if (replayResult.performed) {
    if (replayResult.success) {
      explanation += ' Replay succeeded — the error was transient.';
    } else if (replayResult.sameError) {
      explanation += ' Replay confirmed the error still occurs.';
    }
  }

  return {
    logId: log.id,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    confidence,
    rootCause,
    explanation,
    investigation: {
      checksPerformed: checks,
      problematicItems,
    },
    replay: replayResult,
    fixProposal,
    resolution,
    diagnosedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
}
