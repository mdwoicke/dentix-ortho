/**
 * Dominos Orders Page
 * Matches dashboard-table-standalone.html:
 *   - Filtered stats cards (Total Requests, Success Rate, Avg Response, Errors, Active Sessions)
 *   - Date range pickers with quick filter buttons
 *   - Status/Method/Endpoint/Session filters (all client-side)
 *   - Stats recalculate based on filtered results
 *   - Detail modal: Overview, Request Body, Response Body, Error Details
 *   - Submit test order modal
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as dominosApi from '../../services/api/dominosApi';
import type { DominosOrderLog, DominosLogDetail, ParsedOrder, ParsedOrderItem } from '../../types/dominos.types';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const handleCopy = () => {
    // Fallback for non-HTTPS or when clipboard API is unavailable
    const copyFallback = (str: string) => {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
          copyFallback(text);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        });
      } else {
        copyFallback(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      copyFallback(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function formatJson(data: unknown): string {
  if (data === null || data === undefined) return 'null';
  try {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(data);
  }
}

function formatResponseBody(data: unknown): string {
  if (data === null || data === undefined) return 'null';
  try {
    let parsed = data;
    if (typeof data === 'string') {
      parsed = JSON.parse(data);
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { /* use as-is */ }
      }
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(data);
  }
}

// ── Dominos Order Parser ─────────────────────────────────────────────────
// Maps product codes to friendly display names (Pydantic-style structured parsing)

const PRODUCT_NAMES: Record<string, string> = {
  // Pizzas - Hand Tossed
  '10SCREEN': 'Small (10") Hand Tossed Cheese Pizza',
  '12SCREEN': 'Medium (12") Hand Tossed Cheese Pizza',
  '14SCREEN': 'Large (14") Hand Tossed Cheese Pizza',
  '16SCREEN': 'Extra Large (16") Hand Tossed Cheese Pizza',
  // Pizzas - Thin Crust
  '10THIN': 'Small (10") Crunchy Thin Crust Cheese Pizza',
  '12THIN': 'Medium (12") Crunchy Thin Crust Cheese Pizza',
  '14THIN': 'Large (14") Crunchy Thin Crust Cheese Pizza',
  // Pizzas - Thin Crust (extended)
  '14TEXTRAV': 'Large (14") Thin Crust ExtravaganZZa Pizza',
  '14TMEATZA': 'Large (14") Thin Crust MeatZZa Feast Pizza',
  // Pizzas - Handmade Pan
  'P10IGFZA': 'Small (10") Handmade Pan Cheese Pizza',
  'P10IGFDX': 'Small (10") Handmade Pan Deluxe Pizza',
  'P10IGFPH': 'Small (10") Handmade Pan Philly Cheese Steak Pizza',
  'P12IPAZA': 'Medium (12") Handmade Pan Cheese Pizza',
  'P12IPAMX': 'Medium (12") Handmade Pan Memphis BBQ Chicken Pizza',
  'P12IPAPV': 'Medium (12") Handmade Pan Pacific Veggie Pizza',
  'P12PSCZA': 'Medium (12") Handmade Pan Specialty Pizza',
  'P12PSCPV': 'Medium (12") Handmade Pan Pacific Veggie Pizza',
  'P12PSCUH': 'Medium (12") Handmade Pan Ultimate Pepperoni Pizza',
  'P_14SCREEN': 'Large (14") Handmade Pan Cheese Pizza',
  'PPAN': 'Handmade Pan Cheese Pizza',
  // Pizzas - Brooklyn Style
  'P12IBKZA': 'Medium (12") Brooklyn Style Cheese Pizza',
  '14SCEXTRAV': 'Large (14") Hand Tossed ExtravaganZZa Pizza',
  'P14IRECK': 'Large (14") Brooklyn Style Wisconsin Cheese Pizza',
  'P14IRESC': 'Large (14") Brooklyn Style Spinach & Feta Pizza',
  'P14ITHSC': 'Large (14") Brooklyn Style Honolulu Hawaiian Pizza',
  'P14ITPEP': 'Large (14") Brooklyn Style Pepperoni Pizza',
  'P16IBKZA': 'Extra Large (16") Brooklyn Style Cheese Pizza',
  'P16IBKZZ': 'Extra Large (16") Brooklyn Style Cheese Pizza',
  'PBKIREZA': 'Brooklyn Style Cheese Pizza',
  'PBKIREDX': 'Brooklyn Style Deluxe Pizza',
  // Specialty Pizzas
  '10SCDELUX': 'Small (10") Hand Tossed Deluxe Pizza',
  '12SCDELUX': 'Medium (12") Hand Tossed Deluxe Pizza',
  '12SCEXTRAV': 'Medium (12") Hand Tossed ExtravaganZZa Pizza',
  '12SCMEATZA': 'Medium (12") Hand Tossed MeatZZa Feast Pizza',
  '14SCDELUX': 'Large (14") Hand Tossed Deluxe Pizza',
  '14SCMEATZA': 'Large (14") Hand Tossed MeatZZa Feast Pizza',
  '14SCPFEAST': 'Large (14") Hand Tossed Pepperoni Feast Pizza',
  'CEABBQC': 'Chicken & Applewood Bacon BBQ Pizza',
  'PHLLYSTEAK': 'Philly Cheese Steak Pizza',
  'P14ITHPZA': 'Large (14") Hand Tossed Italian Sausage & Peppers Pizza',
  'P12IPHCZA': 'Medium (12") Handmade Pan Philly Cheese Steak Pizza',
  // Gluten Free
  'P10IGFZA_GF': 'Small (10") Gluten Free Crust Cheese Pizza',
  // Wings - Bone-In
  'W08PPLNW': 'Plain Chicken Wings (8 Piece)',
  'W08PHOTW': 'Hot Buffalo Chicken Wings (8 Piece)',
  'W08PMLDW': 'Mild Buffalo Chicken Wings (8 Piece)',
  'W08PBBQW': 'Sweet BBQ Bacon Chicken Wings (8 Piece)',
  'W08PGPMW': 'Garlic Parmesan Chicken Wings (8 Piece)',
  'W08PMANW': 'Mango Habanero Chicken Wings (8 Piece)',
  'W16PPLNW': 'Plain Chicken Wings (16 Piece)',
  'W16PHOTW': 'Hot Buffalo Chicken Wings (16 Piece)',
  'W16PBBQW': 'Sweet BBQ Bacon Chicken Wings (16 Piece)',
  'W32PMANW': 'Mango Habanero Chicken Wings (32 Piece)',
  'W40PPLNW': 'Plain Chicken Wings (40 Piece)',
  // Wings - Boneless
  'W08PBNLW': 'Boneless Chicken Wings (8 Piece)',
  'W16PBNLW': 'Boneless Chicken Wings (16 Piece)',
  // Chicken Bites
  'CKRGHTB': 'Spicy Crispy Chicken Bites',
  'CKRGSBQ': 'Sweet BBQ Crispy Chicken Bites',
  'CKRGSJP': 'Jalapeno Crispy Chicken Bites',
  // Bread
  'B16PBIT': 'Parmesan Bread Bites (16 Piece)',
  'B16GBIT': 'Garlic Bread Bites (16 Piece)',
  'B32PBIT': 'Parmesan Bread Bites (32 Piece)',
  'B32GBIT': 'Garlic Bread Bites (32 Piece)',
  'B8PCSCB': 'Stuffed Cheesy Bread (8 Piece)',
  'B8PCSBJ': 'Stuffed Cheesy Bread with Jalapeno (8 Piece)',
  'B8PCSPP': 'Stuffed Cheesy Bread with Pepperoni (8 Piece)',
  'B8PCSSF': 'Stuffed Cheesy Bread with Spinach & Feta (8 Piece)',
  'B8PCCT': 'Bread Bowl Pasta - Chicken Alfredo',
  'BREADSTIX': 'Classic Garden Fresh Breadsticks (8 Piece)',
  'CINNASTIX': 'Cinnamon Bread Twists with Sweet Icing (8 Piece)',
  'CKRGCBT': 'Chicken Carbonara Bread Bowl Pasta',
  'PINBBLCB': 'Italian Sausage Marinara Bread Bowl Pasta',
  'B2PCLB': 'Stuffed Cheesy Bread with Cheese & Bacon (8 Piece)',
  'B2PCJB': 'Stuffed Cheesy Bread with Jalapeno & Bacon (8 Piece)',
  'B2PCBB': 'Stuffed Cheesy Bread with Bacon (8 Piece)',
  'B2PCSBG': 'Stuffed Cheesy Bread with Spinach & Feta (8 Piece)',
  'PARBITES': 'Parmesan Bread Bites',
  'STCHZBD': 'Stuffed Cheesy Bread (8 Piece)',
  // Drinks
  '2LCOKE': '2-Liter Coca-Cola Classic',
  '2LDCOKE': '2-Liter Diet Coke',
  '2LSPRITE': '2-Liter Sprite',
  '2LDRPEPPER': '2-Liter Dr Pepper',
  '2LMMORANGE': '2-Liter Minute Maid Orange',
  '2LTBPIBB': '2-Liter Pibb Xtra',
  '2LMTDEW': '2-Liter Mountain Dew',
  '20BCOKE': '20 oz Coca-Cola Classic Bottle',
  '20BDCOKE': '20 oz Diet Coke Bottle',
  '20BSPRITE': '20 oz Sprite Bottle',
  '20BDRPEP': '20 oz Dr Pepper Bottle',
  'BOTTLWATER': 'Dasani Bottled Water (20 oz)',
  // Desserts
  'MARBRWNE': 'Domino\'s Marbled Cookie Brownie (9 Piece)',
  'B16CBIT': 'Cinnamon Bread Bites (16 Piece)',
  'B3PCLAVA': 'Chocolate Lava Crunch Cakes (3 Piece)',
  'CINNATWST': 'Cinnamon Bread Twists with Sweet Icing (8 Piece)',
  'CHOCLAVAC': 'Chocolate Lava Crunch Cakes (2 Piece)',
  // Pasta
  'PASTA': 'Build Your Own Pasta',
  'PINPASCA': 'Chicken Carbonara Pasta in a Bread Bowl',
  'PINPASPP': 'Pasta Primavera in a Bread Bowl',
  'PINPASBD': 'Build Your Own Pasta in a Bread Bowl',
  'PINPASBUFF': 'Spicy Buffalo 5-Cheese Mac & Cheese in a Bread Bowl',
  'PINPASIM': 'Italian Sausage Marinara Pasta in a Bread Bowl',
  'PINPAS5CMC': 'Five Cheese Mac & Cheese in a Bread Bowl',
  // Salads
  'PPSGARSA': 'Classic Garden Salad',
  'PPSCSRSA': 'Chicken Caesar Salad',
  // Sandwiches
  'PSANSAITAL': 'Italian Sandwich',
  'PSANSACH': 'Chicken Habanero Sandwich',
  'PSANSACP': 'Chicken Parm Sandwich',
  'PSANSAPH': 'Philly Cheese Steak Sandwich',
  'PSANSABC': 'Buffalo Chicken Sandwich',
  'PSANSACB': 'Chicken Bacon Ranch Sandwich',
  'PBITESAND': 'Mediterranean Veggie Sandwich',
  'PCSANDW': 'Chicken Parm Sandwich',
  // Sides / Dipping Sauces
  'RANCH': 'Ranch Dipping Cup',
  'MARINARA': 'Marinara Dipping Cup',
  'BLUECHS': 'Blue Cheese Dipping Cup',
  'GARBUTTER': 'Garlic Butter Dipping Cup',
  'HOTSAUCE': 'Hot Sauce Dipping Cup',
  'ICING': 'Sweet Icing Dipping Cup',
  'REASRP': 'Kicker Hot Sauce Dipping Cup',
  'SIDEJAL': 'Side of Jalapenos',
  'CEAHABC': 'Crispy Chicken & Bacon Caesar Salad',
  // Tots
  'CHEDBACON': 'Cheddar Bacon Loaded Tots',
  'M3CHEESE': 'Melty 3-Cheese Loaded Tots',
};

const TOPPING_NAMES: Record<string, string> = {
  X: 'Sauce', C: 'Cheese', P: 'Pepperoni', S: 'Italian Sausage',
  H: 'Ham', B: 'Beef', K: 'Bacon', Pm: 'Philly Meat',
  M: 'Mushrooms', O: 'Onions', G: 'Green Peppers', N: 'Pineapple',
  J: 'Jalapenos', R: 'Black Olives', Rr: 'Roasted Red Peppers',
  Z: 'Banana Peppers', Td: 'Diced Tomatoes', Si: 'Spinach',
  Fe: 'Feta', Cp: 'Cup & Char Pepperoni', Du: 'Premium Chicken',
  Ac: 'American Cheese', E: 'Cheddar', Cs: 'Shredded Parmesan',
  GOB: 'Garlic Oil Base', Xf: 'Alfredo Sauce', Xw: 'BBQ Sauce',
  Ht: 'Hot Sauce', Bv: 'Balsamic',
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
  Pizza:     { label: 'Pizza',          icon: '\uD83C\uDF55', order: 1 },
  Wings:     { label: 'Wings',          icon: '\uD83C\uDF57', order: 2 },
  Bread:     { label: 'Bread & Sides',  icon: '\uD83C\uDF5E', order: 3 },
  Pasta:     { label: 'Pasta',          icon: '\uD83C\uDF5D', order: 4 },
  Sandwich:  { label: 'Sandwiches',     icon: '\uD83E\uDD6A', order: 5 },
  GSalad:    { label: 'Salads',         icon: '\uD83E\uDD57', order: 6 },
  Tots:      { label: 'Loaded Tots',    icon: '\uD83E\uDD54', order: 7 },
  Sides:     { label: 'Dipping Sauces', icon: '\uD83E\uDED5', order: 8 },
  Drinks:    { label: 'Drinks',         icon: '\uD83E\uDD64', order: 9 },
  Drink:     { label: 'Drinks',         icon: '\uD83E\uDD64', order: 9 },
  Dessert:   { label: 'Desserts',       icon: '\uD83C\uDF70', order: 10 },
  Side:      { label: 'Sides',          icon: '\uD83E\uDD54', order: 11 },
  Other:     { label: 'Other Items',    icon: '\uD83D\uDCE6', order: 99 },
};

function inferCategory(code: string): string {
  const upper = code.toUpperCase();
  if (upper.startsWith('W') && (upper.includes('PLN') || upper.includes('HOT') || upper.includes('BBQ') || upper.includes('MAN') || upper.includes('BNL') || upper.includes('GPM') || upper.includes('MLD'))) return 'Wings';
  if (upper.startsWith('CKRG')) return 'Wings';
  if (upper.startsWith('B') && (upper.includes('BIT') || upper.includes('BREAD') || upper.includes('STI') || upper.includes('PCS'))) return 'Bread';
  if (upper.includes('2L') || upper.includes('20B') || upper.includes('WATER') || upper.includes('COKE') || upper.includes('SPRITE') || upper.includes('PEPSI') || upper.includes('DEW') || upper.includes('PIBB') || upper.includes('ORANGE')) return 'Drinks';
  if (upper.includes('BRWNE') || upper.includes('LAVAC') || upper.includes('LAVA') || upper.includes('COOKIE') || upper === 'B16CBIT') return 'Dessert';
  if (upper.includes('PINPAS') || upper.includes('PASTA')) return 'Pasta';
  if (upper.includes('SAND') || upper.startsWith('PSANSA')) return 'Sandwich';
  if (upper.startsWith('PPS') || upper.includes('SALAD')) return 'GSalad';
  if (upper === 'CHEDBACON' || upper === 'M3CHEESE') return 'Tots';
  if (upper === 'RANCH' || upper === 'MARINARA' || upper === 'BLUECHS' || upper === 'GARBUTTER' || upper === 'HOTSAUCE' || upper === 'ICING' || upper === 'REASRP' || upper === 'SIDEJAL') return 'Sides';
  if (upper.includes('SCREEN') || upper.includes('THIN') || upper.includes('PAN') || upper.includes('ZA') || upper.includes('IRECK') || upper.includes('IRESC') || upper.startsWith('P1')) return 'Pizza';
  return 'Other';
}

function formatToppings(options: Record<string, Record<string, string>> | undefined): string[] {
  if (!options || typeof options !== 'object') return [];
  return Object.entries(options)
    .filter(([key]) => key !== 'GOB') // Show GOB separately as base
    .map(([key, val]) => {
      const name = TOPPING_NAMES[key] || key;
      const amount = Object.values(val || {})[0];
      if (amount === '1.5') return `Extra ${name}`;
      if (amount === '2') return `Double ${name}`;
      if (amount === '0.5') return `Light ${name}`;
      return name;
    });
}

function parseOrderRequest(requestBody: unknown): ParsedOrder | null {
  if (!requestBody) return null;
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    if (!body || typeof body !== 'object') return null;

    const rb = body as Record<string, any>;
    const orderData = rb.orderDataBody || rb.order_data_body || rb;
    const cart = orderData?.cart || orderData?.Cart || {};
    const products = cart?.products || cart?.Products || [];

    if (!Array.isArray(products) || products.length === 0) return null;

    const parsedItems: ParsedOrderItem[] = products.map((p: any) => {
      const code = p.Code || p.code || '';
      const catCode = p.CategoryCode || p.categoryCode || inferCategory(code);
      const cfg = CATEGORY_CONFIG[catCode] || CATEGORY_CONFIG.Other;
      const toppings = formatToppings(p.Options || p.options);
      const hasGarlicBase = p.Options?.GOB || p.options?.GOB;

      const optionsList = [
        ...(hasGarlicBase ? ['Garlic Oil Base'] : []),
        ...toppings,
      ];

      return {
        categoryCode: catCode,
        category: cfg.label,
        code,
        name: PRODUCT_NAMES[code] || code,
        quantity: p.quantity || p.Quantity || p.Qty || 1,
        options: optionsList,
        icon: cfg.icon,
      };
    });

    // Group by category label (so "Drinks"/"Drink" merge into one group)
    const groupMap = new Map<string, { icon: string; order: number; items: ParsedOrderItem[] }>();
    for (const item of parsedItems) {
      const cfg = CATEGORY_CONFIG[item.categoryCode] || CATEGORY_CONFIG.Other;
      const key = cfg.label;
      const existing = groupMap.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        groupMap.set(key, { icon: cfg.icon, order: cfg.order, items: [item] });
      }
    }

    const categories = [...groupMap.entries()]
      .map(([category, { icon, order, items }]) => ({ category, icon, items, order }))
      .sort((a, b) => a.order - b.order)
      .map(({ category, icon, items }) => ({ category, icon, items }));

    return {
      summary: rb.summary || '',
      storeNumber: orderData?.store_number || orderData?.storeId || '',
      orderConfirmed: rb.orderConfirmed === 'true' || rb.orderConfirmed === true,
      couponCode: orderData?.coupon_code || '',
      sessionId: rb.sessionId || rb.elly_session_id || '',
      categories,
      totalItems: parsedItems.reduce((sum, item) => sum + item.quantity, 0),
    };
  } catch {
    return null;
  }
}

function ParsedOrderCard({ order, detail }: { order: ParsedOrder; detail: DominosLogDetail }) {
  const customerName = detail.customer_name;
  const orderType = detail.order_type;

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-800">
      {/* Header */}
      <div className="px-4 py-3 bg-blue-600 dark:bg-blue-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{'\uD83C\uDF55'}</span>
          <h4 className="text-white font-semibold text-sm">Order Summary</h4>
        </div>
        <div className="flex items-center gap-3">
          {order.storeNumber && (
            <span className="text-blue-100 text-xs">Store #{order.storeNumber}</span>
          )}
          {orderType && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-xs font-medium capitalize">
              {orderType}
            </span>
          )}
          {order.orderConfirmed && (
            <span className="px-2 py-0.5 rounded-full bg-green-500 text-white text-xs font-medium">
              Confirmed
            </span>
          )}
        </div>
      </div>

      {/* Customer + Summary */}
      <div className="px-4 py-3 border-b border-blue-100 dark:border-blue-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {customerName && (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-sm">{'\uD83D\uDC64'}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{customerName}</span>
              </div>
            )}
            {detail.customer_phone && (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-sm">{'\uD83D\uDCDE'}</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{detail.customer_phone}</span>
              </div>
            )}
          </div>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {order.totalItems} {order.totalItems === 1 ? 'item' : 'items'}
          </span>
        </div>
        {order.summary && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">
            &ldquo;{order.summary}&rdquo;
          </p>
        )}
      </div>

      {/* Categorized Items */}
      <div className="px-4 py-3 space-y-3">
        {order.categories.map((cat) => (
          <div key={cat.category}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span>{cat.icon}</span>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {cat.category}
              </span>
              <span className="text-xs text-gray-400">({cat.items.length})</span>
            </div>
            <div className="space-y-1.5 ml-6">
              {cat.items.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between bg-white dark:bg-gray-800 rounded-md px-3 py-2 border border-gray-100 dark:border-gray-700 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.name}
                      </span>
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                        {item.code}
                      </span>
                    </div>
                    {item.options.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.options.map((opt, oi) => (
                          <span
                            key={oi}
                            className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="ml-3 text-sm text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
                    x{item.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Coupon footer */}
      {order.couponCode && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800/50 flex items-center gap-2">
          <span className="text-sm">{'\uD83C\uDFF7\uFE0F'}</span>
          <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">Coupon: {order.couponCode}</span>
        </div>
      )}
    </div>
  );
}

function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function parseLogTimestamp(ts: string): Date | null {
  if (!ts) return null;
  // Handle CST/CDT formatted: "01/14/2026, 09:54:12 AM CST"
  const cleaned = ts.replace(/ C[DS]T$/, '');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

/** Extract nested order object - Dominos API may nest under .Order or .result.Order */
function extractOrder(result: Record<string, any>): Record<string, any> | null {
  if (result.Order) return result.Order;
  if (result.result?.Order) return result.result.Order;
  if (result.order) return result.order;
  if (result.result?.order) return result.result.order;
  // If result itself looks like an order (has Products or Amounts)
  if (result.Products || result.Amounts || result.StoreID) return result;
  return null;
}

function extractProducts(order: Record<string, any>): { code: string; name: string; qty: number; price: number }[] {
  const products = order.Products || order.products || [];
  if (!Array.isArray(products)) return [];
  return products.map((p: any) => ({
    code: p.Code || p.code || '',
    name: p.Name || p.name || p.Code || p.code || '',
    qty: p.Qty || p.qty || p.Quantity || p.quantity || 1,
    price: parseFloat(p.Price || p.price || p.Amount || p.amount || '0') || 0,
  }));
}

function extractAmounts(order: Record<string, any>): { label: string; value: number }[] {
  const amounts: { label: string; value: number }[] = [];
  const a = order.Amounts || order.amounts;
  if (a && typeof a === 'object') {
    const map: Record<string, string> = {
      Menu: 'Subtotal', Food: 'Food', Discount: 'Discount', Surcharge: 'Surcharge',
      Adjustment: 'Adjustment', Tax: 'Tax', Tax1: 'Tax', Tax2: 'Tax 2', Tax3: 'Tax 3',
      Tax4: 'Tax 4', Tax5: 'Tax 5', Bottle: 'Bottle Deposit', Customer: 'Total',
      Payment: 'Payment',
    };
    for (const [key, label] of Object.entries(map)) {
      const val = parseFloat(a[key] ?? '');
      if (!isNaN(val) && val !== 0) amounts.push({ label, value: val });
    }
  }
  // Fallback: check top-level price fields
  if (amounts.length === 0) {
    for (const key of ['total', 'Total', 'order_total', 'orderTotal', 'price', 'Price']) {
      const val = parseFloat(order[key] ?? '');
      if (!isNaN(val) && val > 0) {
        amounts.push({ label: 'Total', value: val });
        break;
      }
    }
  }
  return amounts;
}

function OrderResultSummary({ result, showRawJson, onToggleRaw }: { result: Record<string, any>; showRawJson: boolean; onToggleRaw: () => void }) {
  const order = extractOrder(result);
  const isSuccess = result.success !== false && !result.error;
  const orderId = result.orderId || result.OrderID || result.PulseOrderGuid || order?.OrderID || order?.PulseOrderGuid || '';
  const storeId = order?.StoreID || order?.storeId || result.storeId || '';
  const serviceMethod = order?.ServiceMethod || order?.serviceMethod || '';
  const phone = order?.Phone || order?.phone || '';
  const estimatedWait = order?.EstimatedWaitMinutes || order?.estimatedWaitMinutes || '';
  const priceOrderTime = order?.PriceOrderTime || '';
  const statusCode = order?.Status || result.Status || result.status_code || '';
  const products = order ? extractProducts(order) : [];
  const amounts = order ? extractAmounts(order) : [];
  const promotions = order?.Promotions || order?.promotions;
  const availablePromos = promotions?.AvailablePromos || promotions?.availablePromos;
  const coupons = order?.Coupons || order?.coupons || [];
  const totalAmount = amounts.find(a => a.label === 'Total');

  return (
    <div className="space-y-3">
      {/* Status Banner */}
      <div className={`p-4 rounded-lg border ${isSuccess
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-lg ${isSuccess ? 'text-green-600' : 'text-red-600'}`}>
              {isSuccess ? '\u2705' : '\u274C'}
            </span>
            <span className={`font-semibold ${isSuccess ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {isSuccess ? 'Order Submitted Successfully' : 'Order Failed'}
            </span>
          </div>
          {totalAmount && (
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              ${totalAmount.value.toFixed(2)}
            </span>
          )}
        </div>
        {orderId && (
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
            Order ID: {orderId}
          </div>
        )}
        {result.error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{result.error}</p>
        )}
      </div>

      {/* Order Info Grid */}
      {(storeId || serviceMethod || phone || estimatedWait || priceOrderTime) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {storeId && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Store</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">#{storeId}</div>
            </div>
          )}
          {serviceMethod && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Service</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{serviceMethod}</div>
            </div>
          )}
          {phone && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Phone</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{phone}</div>
            </div>
          )}
          {estimatedWait && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Est. Wait</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{estimatedWait} min</div>
            </div>
          )}
          {priceOrderTime && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Priced At</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{priceOrderTime}</div>
            </div>
          )}
          {statusCode && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Status</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{String(statusCode)}</div>
            </div>
          )}
        </div>
      )}

      {/* Items Table */}
      {products.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Items ({products.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Code</th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Item</th>
                <th className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {products.map((p, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-400">{p.code}</td>
                  <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100">{p.name}</td>
                  <td className="px-3 py-1.5 text-center text-gray-600 dark:text-gray-400">{p.qty}</td>
                  <td className="px-3 py-1.5 text-right text-gray-900 dark:text-gray-100">
                    {p.price > 0 ? `$${p.price.toFixed(2)}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pricing Breakdown */}
      {amounts.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Pricing
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {amounts.map((a, i) => (
              <div key={i} className={`flex justify-between px-3 py-1.5 text-sm ${
                a.label === 'Total' ? 'bg-gray-50 dark:bg-gray-800 font-bold' : ''
              }`}>
                <span className={`${a.label === 'Discount' ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {a.label}
                </span>
                <span className={`font-mono ${
                  a.label === 'Total' ? 'text-gray-900 dark:text-gray-100 text-base'
                  : a.label === 'Discount' ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {a.value < 0 ? `-$${Math.abs(a.value).toFixed(2)}` : `$${a.value.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotions */}
      {(availablePromos || (Array.isArray(coupons) && coupons.length > 0)) && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-xs font-semibold text-yellow-700 dark:text-yellow-300 uppercase">
            Promotions
          </div>
          <div className="p-3 space-y-1 text-sm">
            {availablePromos && typeof availablePromos === 'object' && Object.entries(availablePromos).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{key}</span>
                <span className="text-yellow-700 dark:text-yellow-300 font-mono">{String(val)}</span>
              </div>
            ))}
            {Array.isArray(coupons) && coupons.map((c: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{c.Code || c.code || `Coupon ${i + 1}`}</span>
                <span className="text-green-600 dark:text-green-400 font-mono">
                  {c.Price ? `-$${parseFloat(c.Price).toFixed(2)}` : 'Applied'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON Toggle */}
      <div>
        <button
          onClick={onToggleRaw}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <span className={`inline-block transition-transform ${showRawJson ? 'rotate-90' : ''}`}>&#9654;</span>
          Raw Response
        </button>
        {showRawJson && (
          <div className="mt-2 relative">
            <CopyButton text={JSON.stringify(result, null, 2)} />
            <pre className="p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-xs font-mono overflow-x-auto max-h-60 whitespace-pre-wrap text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DominosOrders() {
  const [allLogs, setAllLogs] = useState<DominosOrderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<DominosLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  // Submit order modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [orderJson, setOrderJson] = useState('{\n  "storeId": "7539",\n  "customerName": "Test",\n  "customerPhone": "5551234567",\n  "address": {\n    "street": "123 Main St",\n    "city": "Anytown",\n    "state": "TX",\n    "zip": "75001"\n  },\n  "items": [{ "code": "12SCREEN", "quantity": 1 }],\n  "paymentType": "Cash",\n  "serviceMethod": "Delivery"\n}');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<Record<string, any> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterSessionId, setFilterSessionId] = useState('');
  const [filterEndpoint, setFilterEndpoint] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState('');

  // Fetch all logs once (large limit, client-side filtering like original)
  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await dominosApi.getDashboardLogs({ limit: 1000 });
      setAllLogs(res.logs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Client-side filtering – only show /api/v1/direct-order endpoint
  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      // Hard filter: only direct-order endpoint
      if (log.endpoint !== '/api/v1/direct-order') return false;

      if (filterStatus && String(log.status_code) !== filterStatus) return false;
      if (filterMethod && log.method !== filterMethod) return false;
      if (filterEndpoint && !log.endpoint?.toLowerCase().includes(filterEndpoint.toLowerCase())) return false;
      if (filterSessionId && !log.session_id?.toLowerCase().includes(filterSessionId.toLowerCase())) return false;

      // Date range filter
      if (dateStart || dateEnd) {
        const logDate = parseLogTimestamp(log.timestamp_cst || log.timestamp);
        if (!logDate) return false;
        if (dateStart) {
          const start = new Date(dateStart);
          if (logDate < start) return false;
        }
        if (dateEnd) {
          const end = new Date(dateEnd);
          if (logDate > end) return false;
        }
      }

      return true;
    });
  }, [allLogs, filterStatus, filterMethod, filterEndpoint, filterSessionId, dateStart, dateEnd]);

  // Compute stats from filtered logs (matches original calculateFilteredStats)
  const filteredStats = useMemo(() => {
    let successCount = 0;
    let errorCount = 0;
    let totalTime = 0;
    const sessions = new Set<string>();

    filteredLogs.forEach(log => {
      if (log.success) successCount++;
      else errorCount++;
      totalTime += log.response_time_ms || 0;
      if (log.session_id) sessions.add(log.session_id);
    });

    const total = filteredLogs.length;
    return {
      total,
      successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
      avgResponse: total > 0 ? Math.round(totalTime / total) : 0,
      errors: errorCount,
      activeSessions: sessions.size,
    };
  }, [filteredLogs]);

  // Build filter indicator text (matches original)
  const filterIndicator = useMemo(() => {
    const parts: string[] = [];
    if (filterStatus) parts.push(`Status: ${filterStatus}`);
    if (filterMethod) parts.push(`Method: ${filterMethod}`);
    if (filterEndpoint) parts.push(`Endpoint: "${filterEndpoint}"`);
    if (filterSessionId) parts.push(`Session: "${filterSessionId}"`);
    if (dateStart || dateEnd) {
      const s = dateStart ? new Date(dateStart).toLocaleDateString() : '';
      const e = dateEnd ? new Date(dateEnd).toLocaleDateString() : '';
      if (s && e && s === e) parts.push(`Date: ${s}`);
      else if (s && e) parts.push(`Date: ${s} - ${e}`);
      else if (s) parts.push(`Date: from ${s}`);
      else parts.push(`Date: to ${e}`);
    }
    if (parts.length > 0) {
      return `(Showing ${filteredLogs.length} of ${allLogs.length} logs - Filters: ${parts.join(', ')})`;
    }
    return `(Showing all ${allLogs.length} logs)`;
  }, [filteredLogs.length, allLogs.length, filterStatus, filterMethod, filterEndpoint, filterSessionId, dateStart, dateEnd]);

  const hasActiveFilters = filterStatus || filterMethod || filterEndpoint || filterSessionId || dateStart || dateEnd;

  const clearAllFilters = () => {
    setFilterStatus('');
    setFilterMethod('');
    setFilterEndpoint('');
    setFilterSessionId('');
    setDateStart('');
    setDateEnd('');
    setActiveQuickFilter('');
  };

  const setQuickDateFilter = (period: string) => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (period) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        start = new Date(y.getFullYear(), y.getMonth(), y.getDate());
        end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
        break;
      }
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return;
    }

    setDateStart(formatDateForInput(start));
    setDateEnd(formatDateForInput(end));
    setActiveQuickFilter(period);
  };

  const clearDateFilter = () => {
    setDateStart('');
    setDateEnd('');
    setActiveQuickFilter('');
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      setImportResult(null);
      const result = await dominosApi.importOrderLogs();
      setImportResult(result);
      if (result.imported > 0) {
        fetchLogs();
      }
      // Auto-clear the result message after 5 seconds
      setTimeout(() => setImportResult(null), 5000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleViewDetail = async (logId: number) => {
    setDetailLoading(true);
    try {
      const detail = await dominosApi.getDashboardLogById(logId);
      setSelectedLog(detail as DominosLogDetail);
    } catch {
      const fallback = allLogs.find(l => l.id === logId);
      if (fallback) setSelectedLog({ ...fallback, request_body: null, response_body: null } as DominosLogDetail);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmitOrder = async () => {
    try {
      setSubmitting(true);
      setSubmitResult(null);
      setSubmitError(null);
      setShowRawJson(false);
      const order = JSON.parse(orderJson);
      const result = await dominosApi.submitOrder(order);
      setSubmitResult(result);
      fetchLogs();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      {/* Filtered Statistics header + Clear All */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtered Statistics</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{filterIndicator}</span>
        </div>
        <div className="flex items-center gap-2">
          {importResult && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Imported {importResult.imported} new records{importResult.skipped > 0 ? ` (${importResult.skipped} skipped)` : ''}
            </span>
          )}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-1.5 text-sm font-medium text-white bg-gray-500 rounded-md hover:bg-gray-600 transition-colors"
            >
              Clear All Filters
            </button>
          )}
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importing...' : 'Import Orders'}
          </button>
          <button
            onClick={fetchLogs}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats cards - 5 across (matches original) */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Requests</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{filteredStats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Success Rate</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{filteredStats.successRate}%</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Avg Response</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{filteredStats.avgResponse}ms</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Errors</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{filteredStats.errors}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Active Sessions</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{filteredStats.activeSessions}</div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Table wrapper */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {/* Table header: title + filters row */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Request Logs</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">All Status</option>
                <option value="200">200 OK</option>
                <option value="400">400 Bad Request</option>
                <option value="401">401 Unauthorized</option>
                <option value="404">404 Not Found</option>
                <option value="500">500 Server Error</option>
              </select>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">All Methods</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="text"
                placeholder="Search session..."
                value={filterSessionId}
                onChange={(e) => setFilterSessionId(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Date Range filter section */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-md p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Date Range:</span>
                <input
                  type="datetime-local"
                  value={dateStart}
                  onChange={(e) => { setDateStart(e.target.value); setActiveQuickFilter(''); }}
                  className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">to</span>
                <input
                  type="datetime-local"
                  value={dateEnd}
                  onChange={(e) => { setDateEnd(e.target.value); setActiveQuickFilter(''); }}
                  className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                {(dateStart || dateEnd) && (
                  <button
                    onClick={clearDateFilter}
                    className="px-3 py-1 text-sm font-medium text-white bg-gray-500 rounded hover:bg-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Quick filters:</span>
                {[
                  { key: '1h', label: 'Last 1 Hour' },
                  { key: 'today', label: 'Today' },
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: '7d', label: 'Last 7 Days' },
                  { key: '30d', label: 'Last 30 Days' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setQuickDateFilter(key)}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      activeQuickFilter === key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Logs table */}
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 520px)' }}>
          <table className="w-full">
            <thead className="sticky top-0 bg-white dark:bg-gray-800 shadow-sm z-10">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Method</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Endpoint</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Response</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Session</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Error</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading logs...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No logs found</td></tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{log.timestamp_cst || log.timestamp}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.method === 'POST' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400'
                        : log.method === 'PUT' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'
                        : log.method === 'DELETE' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>{log.method || 'GET'}</span>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-gray-600 dark:text-gray-400 truncate max-w-[300px]" title={log.endpoint}>{log.endpoint || '/'}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.success ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400'
                      }`}>{log.status_code || 200}</span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{log.response_time_ms || 0}ms</td>
                    <td className="px-4 py-2 text-xs font-mono text-gray-600 dark:text-gray-400 truncate max-w-[250px]" title={log.session_id}>{log.session_id || 'unknown'}</td>
                    <td className="px-4 py-2 text-center">
                      {log.error_message ? (
                        <span className="text-red-500" title={log.error_message}>&#9888;</span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleViewDetail(log.id)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with Submit Test Order */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filteredLogs.length} {filteredLogs.length === 1 ? 'log' : 'logs'} shown
          </span>
          <button
            onClick={() => { setShowSubmitModal(true); setSubmitResult(null); setSubmitError(null); setShowRawJson(false); }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            Submit Test Order
          </button>
        </div>
      </div>

      {/* Request Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setSelectedLog(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Request Details</h3>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-5">
              {detailLoading ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading details...</div>
              ) : (
                <>
                  {/* Parsed Order Summary - displayed at the very top */}
                  {(() => {
                    const parsed = parseOrderRequest(selectedLog.request_body);
                    return parsed ? <ParsedOrderCard order={parsed} detail={selectedLog} /> : null;
                  })()}

                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Overview</h4>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 text-sm space-y-1">
                      <div><span className="font-medium text-gray-700 dark:text-gray-300">Request ID:</span> <span className="font-mono text-gray-600 dark:text-gray-400">{selectedLog.request_id || selectedLog.id}</span></div>
                      <div><span className="font-medium text-gray-700 dark:text-gray-300">Session ID:</span> <span className="font-mono text-gray-600 dark:text-gray-400">{selectedLog.session_id || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-700 dark:text-gray-300">Timestamp:</span> <span className="text-gray-600 dark:text-gray-400">{selectedLog.timestamp_cst || selectedLog.timestamp}</span></div>
                      <div><span className="font-medium text-gray-700 dark:text-gray-300">Method:</span> <span className="text-gray-600 dark:text-gray-400">{selectedLog.method || 'GET'}</span></div>
                      <div><span className="font-medium text-gray-700 dark:text-gray-300">Endpoint:</span> <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs">{selectedLog.endpoint || '/'}</code></div>
                      <div><span className="font-medium text-gray-700 dark:text-gray-300">Status:</span> <span className={selectedLog.success ? 'text-green-600' : 'text-red-600'}>{selectedLog.status_code || 200}</span></div>
                      <div><span className="font-medium text-gray-700 dark:text-gray-300">Response Time:</span> <span className="text-gray-600 dark:text-gray-400">{selectedLog.response_time_ms || 0}ms</span></div>
                      {selectedLog.store_id && (
                        <div><span className="font-medium text-gray-700 dark:text-gray-300">Store ID:</span> <span className="text-gray-600 dark:text-gray-400">{selectedLog.store_id}</span></div>
                      )}
                      {(selectedLog.order_total ?? 0) > 0 && (
                        <div><span className="font-medium text-gray-700 dark:text-gray-300">Order Total:</span> <span className="text-gray-600 dark:text-gray-400">${selectedLog.order_total.toFixed(2)}</span></div>
                      )}
                      {(selectedLog.items_count ?? 0) > 0 && (
                        <div><span className="font-medium text-gray-700 dark:text-gray-300">Items Count:</span> <span className="text-gray-600 dark:text-gray-400">{selectedLog.items_count}</span></div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Request Body</h4>
                      {selectedLog.request_body && (
                        <CopyButton text={formatJson(selectedLog.request_body)} />
                      )}
                    </div>
                    {selectedLog.request_body ? (
                      <pre className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-96 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                        {formatJson(selectedLog.request_body)}
                      </pre>
                    ) : (
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 text-sm text-gray-400 dark:text-gray-500 italic">No request body available</div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Response Body</h4>
                      {selectedLog.response_body && (
                        <CopyButton text={formatResponseBody(selectedLog.response_body)} />
                      )}
                    </div>
                    {selectedLog.response_body ? (
                      <pre className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-96 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                        {formatResponseBody(selectedLog.response_body)}
                      </pre>
                    ) : (
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 text-sm text-gray-400 dark:text-gray-500 italic">No response body available</div>
                    )}
                  </div>

                  {(selectedLog.error_message || selectedLog.error_stack) && (
                    <div>
                      <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Error Details</h4>
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-md p-3">
                        {selectedLog.error_message && (
                          <div className="text-sm"><span className="font-medium">Message:</span> {selectedLog.error_message}</div>
                        )}
                        {selectedLog.error_stack && (
                          <pre className="text-xs font-mono mt-2 whitespace-pre-wrap text-red-700 dark:text-red-300">{selectedLog.error_stack}</pre>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedLog.errors && selectedLog.errors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Associated Errors ({selectedLog.errors.length})</h4>
                      <div className="space-y-2">
                        {selectedLog.errors.map((err, i) => (
                          <div key={i} className="bg-red-50 dark:bg-red-900/20 rounded-md p-3 text-sm">
                            <div><span className="font-medium">Type:</span> {err.type}</div>
                            <div><span className="font-medium">Message:</span> {err.message}</div>
                            {err.stack && <pre className="text-xs font-mono mt-1 whitespace-pre-wrap">{err.stack}</pre>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submit Test Order Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowSubmitModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Submit Test Order</h3>
              <button onClick={() => setShowSubmitModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Order JSON</label>
                <textarea
                  value={orderJson}
                  onChange={(e) => setOrderJson(e.target.value)}
                  rows={16}
                  className="w-full font-mono text-sm p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              {submitError && (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-600 dark:text-red-400 text-lg">&#10060;</span>
                    <span className="font-semibold text-red-700 dark:text-red-300">Order Failed</span>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
                </div>
              )}
              {submitResult && <OrderResultSummary result={submitResult} showRawJson={showRawJson} onToggleRaw={() => setShowRawJson(!showRawJson)} />}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Submit Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
