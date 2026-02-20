/**
 * Sample Order Skill
 *
 * Looks up correct Dominos menu item codes and builds a fully formed
 * DominosOrderSubmission JSON with sensible defaults for all required fields.
 *
 * Handles complex queries like:
 *   "create a sample carryout order for store 7539 for a large extravaganza
 *    without onions and thin crust"
 *
 * Parsing pipeline:
 *   1. Extract store ID, service method, payment type
 *   2. Detect crust type preference (hand tossed, thin, brooklyn, pan)
 *   3. Detect pizza type / specialty (extravaganza, deluxe, meatza, etc.)
 *   4. Detect size (small, medium, large)
 *   5. Detect topping additions ("with pepperoni") and removals ("without onions")
 *   6. Detect non-pizza items (wings, bread, drinks, etc.)
 *   7. Combine into a single coherent order
 */

import type { SkillEntry, SkillResult } from './types';
import type { DominosOrderSubmission } from '../../types/dominos.types';

// ---------------------------------------------------------------------------
// Menu item catalog
// ---------------------------------------------------------------------------

interface MenuItem {
  code: string;
  name: string;
  category: string;
  price: number;
}

// Pizza catalog organized by [crust][size]
// Crust types: hand_tossed, thin, brooklyn, pan
// Sizes: small (10"), medium (12"), large (14"), xlarge (16")
const PIZZA_CODES: Record<string, Record<string, string>> = {
  hand_tossed: { small: '10SCREEN', medium: '12SCREEN', large: '14SCREEN', xlarge: '16SCREEN' },
  thin:        { small: '10THIN',   medium: '12THIN',   large: '14THIN' },
  brooklyn:    { medium: 'P12IBKZA', large: 'P14IRECK', xlarge: 'P16IBKZA' },
  pan:         { small: 'P10IGFZA', medium: 'P12IPAZA' },
};

// Specialty pizzas — these have their own product codes (hand tossed only for simplicity)
const SPECIALTY_PIZZAS: Record<string, Record<string, string>> = {
  extravaganza: { small: '10SCREEN', medium: '12SCEXTRAV', large: '14SCEXTRAV' },
  deluxe:       { small: '10SCDELUX', medium: '12SCDELUX', large: '14SCDELUX' },
  meatzza:      { small: '10SCREEN',  medium: '12SCMEATZA', large: '14SCMEATZA' },
  pepperoni_feast: { large: '14SCPFEAST' },
};

const MENU_ITEMS: Record<string, MenuItem> = {
  // Pizzas (all variants)
  '10SCREEN':   { code: '10SCREEN',   name: 'Small (10") Hand Tossed Cheese Pizza',       category: 'Pizza', price: 7.99 },
  '12SCREEN':   { code: '12SCREEN',   name: 'Medium (12") Hand Tossed Cheese Pizza',      category: 'Pizza', price: 9.99 },
  '14SCREEN':   { code: '14SCREEN',   name: 'Large (14") Hand Tossed Cheese Pizza',       category: 'Pizza', price: 11.99 },
  '16SCREEN':   { code: '16SCREEN',   name: 'Extra Large (16") Hand Tossed Cheese Pizza', category: 'Pizza', price: 13.99 },
  '10THIN':     { code: '10THIN',     name: 'Small (10") Crunchy Thin Crust Cheese Pizza',  category: 'Pizza', price: 7.99 },
  '12THIN':     { code: '12THIN',     name: 'Medium (12") Crunchy Thin Crust Cheese Pizza', category: 'Pizza', price: 9.99 },
  '14THIN':     { code: '14THIN',     name: 'Large (14") Crunchy Thin Crust Cheese Pizza',  category: 'Pizza', price: 11.99 },
  'P12IBKZA':   { code: 'P12IBKZA',   name: 'Medium (12") Brooklyn Style Cheese Pizza',   category: 'Pizza', price: 10.99 },
  'P14IRECK':   { code: 'P14IRECK',   name: 'Large (14") Brooklyn Style Cheese Pizza',    category: 'Pizza', price: 12.99 },
  'P16IBKZA':   { code: 'P16IBKZA',   name: 'Extra Large (16") Brooklyn Style Cheese Pizza', category: 'Pizza', price: 14.99 },
  'P10IGFZA':   { code: 'P10IGFZA',   name: 'Small (10") Handmade Pan Cheese Pizza',      category: 'Pizza', price: 8.99 },
  'P12IPAZA':   { code: 'P12IPAZA',   name: 'Medium (12") Handmade Pan Cheese Pizza',     category: 'Pizza', price: 10.99 },
  // Specialty
  '10SCDELUX':  { code: '10SCDELUX',  name: 'Small (10") Hand Tossed Deluxe Pizza',        category: 'Pizza', price: 12.99 },
  '12SCDELUX':  { code: '12SCDELUX',  name: 'Medium (12") Hand Tossed Deluxe Pizza',       category: 'Pizza', price: 13.99 },
  '14SCDELUX':  { code: '14SCDELUX',  name: 'Large (14") Hand Tossed Deluxe Pizza',        category: 'Pizza', price: 14.99 },
  '12SCEXTRAV': { code: '12SCEXTRAV', name: 'Medium (12") Hand Tossed ExtravaganZZa Pizza', category: 'Pizza', price: 14.99 },
  '14SCEXTRAV': { code: '14SCEXTRAV', name: 'Large (14") Hand Tossed ExtravaganZZa Pizza',  category: 'Pizza', price: 15.99 },
  '12SCMEATZA': { code: '12SCMEATZA', name: 'Medium (12") Hand Tossed MeatZZa Feast Pizza', category: 'Pizza', price: 14.99 },
  '14SCMEATZA': { code: '14SCMEATZA', name: 'Large (14") Hand Tossed MeatZZa Feast Pizza',  category: 'Pizza', price: 15.99 },
  '14SCPFEAST': { code: '14SCPFEAST', name: 'Large (14") Hand Tossed Pepperoni Feast Pizza', category: 'Pizza', price: 14.99 },
  // Wings
  'W08PHOTW':  { code: 'W08PHOTW',  name: 'Hot Buffalo Chicken Wings (8 Piece)',        category: 'Wings', price: 8.99 },
  'W08PBBQW':  { code: 'W08PBBQW',  name: 'Sweet BBQ Bacon Chicken Wings (8 Piece)',    category: 'Wings', price: 8.99 },
  'W16PHOTW':  { code: 'W16PHOTW',  name: 'Hot Buffalo Chicken Wings (16 Piece)',       category: 'Wings', price: 14.99 },
  'W08PBNLW':  { code: 'W08PBNLW',  name: 'Boneless Chicken Wings (8 Piece)',           category: 'Wings', price: 8.99 },
  // Bread & Sides
  'B16PBIT':   { code: 'B16PBIT',   name: 'Parmesan Bread Bites (16 Piece)',            category: 'Bread', price: 5.99 },
  'B8PCSCB':   { code: 'B8PCSCB',   name: 'Stuffed Cheesy Bread (8 Piece)',             category: 'Bread', price: 7.99 },
  'BREADSTIX': { code: 'BREADSTIX', name: 'Classic Garden Fresh Breadsticks (8 Piece)',  category: 'Bread', price: 5.99 },
  'CINNASTIX': { code: 'CINNASTIX', name: 'Cinnamon Bread Twists with Sweet Icing (8 Piece)', category: 'Bread', price: 6.99 },
  // Drinks
  '2LCOKE':    { code: '2LCOKE',    name: '2-Liter Coca-Cola Classic',                  category: 'Drinks', price: 3.49 },
  '2LSPRITE':  { code: '2LSPRITE',  name: '2-Liter Sprite',                             category: 'Drinks', price: 3.49 },
  '20BCOKE':   { code: '20BCOKE',   name: '20 oz Coca-Cola Classic Bottle',             category: 'Drinks', price: 2.29 },
  'BOTTLWATER':{ code: 'BOTTLWATER',name: 'Dasani Bottled Water (20 oz)',               category: 'Drinks', price: 2.09 },
  // Desserts
  'B3PCLAVA':  { code: 'B3PCLAVA',  name: 'Chocolate Lava Crunch Cakes (3 Piece)',      category: 'Dessert', price: 6.99 },
  'MARBRWNE':  { code: 'MARBRWNE',  name: "Domino's Marbled Cookie Brownie (9 Piece)",  category: 'Dessert', price: 7.99 },
  // Pasta
  'PINPASCA':  { code: 'PINPASCA',  name: 'Chicken Carbonara Pasta in a Bread Bowl',    category: 'Pasta', price: 8.99 },
  // Sandwiches
  'PSANSAITAL':{ code: 'PSANSAITAL',name: 'Italian Sandwich',                           category: 'Sandwich', price: 7.99 },
  'PSANSAPH':  { code: 'PSANSAPH',  name: 'Philly Cheese Steak Sandwich',               category: 'Sandwich', price: 7.99 },
  // Dipping Sauces
  'RANCH':     { code: 'RANCH',     name: 'Ranch Dipping Cup',                          category: 'Sides', price: 0.75 },
  'MARINARA':  { code: 'MARINARA',  name: 'Marinara Dipping Cup',                       category: 'Sides', price: 0.75 },
};

// ---------------------------------------------------------------------------
// Topping definitions
// ---------------------------------------------------------------------------

type ToppingOptions = Record<string, Record<string, string>>;

const TOPPING_CODE_NAMES: Record<string, string> = {
  X: 'Sauce', C: 'Cheese', P: 'Pepperoni', S: 'Italian Sausage',
  H: 'Ham', B: 'Beef', K: 'Bacon', M: 'Mushrooms',
  O: 'Onions', G: 'Green Peppers', N: 'Pineapple', J: 'Jalapenos',
  R: 'Black Olives', Z: 'Banana Peppers', Fe: 'Feta',
  Ac: 'American Cheese', GOB: 'Garlic Oil Base', Du: 'Premium Chicken',
};

/** Map natural language topping names → topping codes. */
const TOPPING_NAME_TO_CODE: Record<string, string> = {
  pepperoni: 'P', sausage: 'S', ham: 'H', bacon: 'K', beef: 'B',
  mushroom: 'M', mushrooms: 'M', onion: 'O', onions: 'O',
  'green pepper': 'G', 'green peppers': 'G', peppers: 'G',
  pineapple: 'N', jalapeno: 'J', jalapenos: 'J',
  olive: 'R', olives: 'R', 'black olives': 'R',
  'banana pepper': 'Z', 'banana peppers': 'Z',
  feta: 'Fe', chicken: 'Du', cheese: 'C',
};

/** Default topping sets for specialty pizzas. */
const SPECIALTY_TOPPINGS: Record<string, ToppingOptions> = {
  extravaganza: { X: { '1/1': '1' }, C: { '1/1': '1' }, P: { '1/1': '1' }, S: { '1/1': '1' }, H: { '1/1': '1' }, B: { '1/1': '1' }, M: { '1/1': '1' }, O: { '1/1': '1' }, G: { '1/1': '1' }, R: { '1/1': '1' } },
  deluxe:       { X: { '1/1': '1' }, C: { '1/1': '1' }, P: { '1/1': '1' }, S: { '1/1': '1' }, M: { '1/1': '1' }, O: { '1/1': '1' }, G: { '1/1': '1' } },
  meatzza:      { X: { '1/1': '1' }, C: { '1/1': '1' }, P: { '1/1': '1' }, S: { '1/1': '1' }, H: { '1/1': '1' }, B: { '1/1': '1' } },
  pepperoni:    { X: { '1/1': '1' }, C: { '1/1': '1' }, P: { '1/1': '1' } },
  cheese:       { X: { '1/1': '1' }, C: { '1/1': '1.5' } },
  hawaiian:     { X: { '1/1': '1' }, C: { '1/1': '1' }, H: { '1/1': '1' }, N: { '1/1': '1' } },
  veggie:       { X: { '1/1': '1' }, C: { '1/1': '1' }, M: { '1/1': '1' }, O: { '1/1': '1' }, G: { '1/1': '1' }, R: { '1/1': '1' } },
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STORE_ID = '4332';
const DEFAULT_CUSTOMER = { name: 'Jane Doe', phone: '(720) 555-0199', email: 'jane.doe@example.com' };
const DEFAULT_ADDRESS = { street: '1600 Market St', city: 'Denver', state: 'CO', zip: '80202' };

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

function extractStoreId(query: string): string {
  const m = query.match(/store\s*(?:id\s*)?#?\s*(\d{3,5})/i);
  return m ? m[1] : DEFAULT_STORE_ID;
}

function extractServiceMethod(query: string): 'Delivery' | 'Carryout' {
  if (/carry\s*out|pick\s*up|pickup/i.test(query)) return 'Carryout';
  return 'Delivery';
}

function extractPaymentType(query: string): 'Cash' | 'Card' {
  if (/\bcash\b/i.test(query)) return 'Cash';
  return 'Card';
}

type PizzaSize = 'small' | 'medium' | 'large' | 'xlarge';
type CrustType = 'hand_tossed' | 'thin' | 'brooklyn' | 'pan';

function extractSize(query: string): PizzaSize {
  if (/\bextra\s*large\b|\bxl\b|\bx-large\b/i.test(query)) return 'xlarge';
  if (/\blarge\b/i.test(query)) return 'large';
  if (/\bmedium\b/i.test(query)) return 'medium';
  if (/\bsmall\b|\bpersonal\b/i.test(query)) return 'small';
  return 'large'; // default
}

function extractCrust(query: string): CrustType {
  if (/thin\s*crust|thin$/im.test(query)) return 'thin';
  if (/brooklyn/i.test(query)) return 'brooklyn';
  if (/pan\b/i.test(query)) return 'pan';
  return 'hand_tossed';
}

type SpecialtyType = 'extravaganza' | 'deluxe' | 'meatzza' | 'pepperoni_feast' | 'pepperoni' | 'cheese' | 'hawaiian' | 'veggie' | null;

function extractSpecialty(query: string): SpecialtyType {
  if (/extravagan/i.test(query)) return 'extravaganza';
  if (/\bdeluxe\b/i.test(query)) return 'deluxe';
  if (/\bmeatz/i.test(query)) return 'meatzza';
  if (/pepperoni\s*feast/i.test(query)) return 'pepperoni_feast';
  if (/\bpepperoni\b/i.test(query)) return 'pepperoni';
  if (/\bhawaiian\b/i.test(query)) return 'hawaiian';
  if (/\bveggie\b/i.test(query)) return 'veggie';
  if (/\bcheese\s*pizza\b/i.test(query)) return 'cheese';
  return null;
}

/** Parse "without onions", "no olives", "hold the mushrooms" → topping codes to remove. */
function extractRemovedToppings(query: string): Set<string> {
  const removed = new Set<string>();
  const patterns = [
    /(?:without|no|hold(?:\s+the)?|remove|minus)\s+([\w\s,]+?)(?:\s+and\s+|\s*,\s*|$)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      const segment = match[1].toLowerCase().trim();
      // Split by "and" or comma to handle "without onions and olives"
      const parts = segment.split(/\s+and\s+|\s*,\s*/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (TOPPING_NAME_TO_CODE[trimmed]) {
          removed.add(TOPPING_NAME_TO_CODE[trimmed]);
        }
      }
    }
  }
  return removed;
}

/** Parse "with extra cheese", "add bacon" → topping codes to add. */
function extractAddedToppings(query: string): Map<string, string> {
  const added = new Map<string, string>(); // code → amount
  const patterns = [
    /(?:with|add|plus|extra)\s+([\w\s,]+?)(?:\s+(?:without|no|hold|on|for|and\s+(?:thin|brooklyn|pan|hand))|$)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      const segment = match[1].toLowerCase().trim();
      const parts = segment.split(/\s+and\s+|\s*,\s*/);
      for (const part of parts) {
        let trimmed = part.trim();
        let amount = '1';
        if (trimmed.startsWith('extra ')) {
          amount = '1.5';
          trimmed = trimmed.replace(/^extra\s+/, '');
        } else if (trimmed.startsWith('light ')) {
          amount = '0.5';
          trimmed = trimmed.replace(/^light\s+/, '');
        } else if (trimmed.startsWith('double ')) {
          amount = '2';
          trimmed = trimmed.replace(/^double\s+/, '');
        }
        if (TOPPING_NAME_TO_CODE[trimmed]) {
          added.set(TOPPING_NAME_TO_CODE[trimmed], amount);
        }
      }
    }
  }
  return added;
}

// ---------------------------------------------------------------------------
// Pizza builder
// ---------------------------------------------------------------------------

interface OrderItem {
  menuItem: MenuItem;
  qty: number;
  toppings?: ToppingOptions;
  notes?: string;
}

function buildPizza(query: string): OrderItem | null {
  const size = extractSize(query);
  const crust = extractCrust(query);
  const specialty = extractSpecialty(query);
  const removedToppings = extractRemovedToppings(query);
  const addedToppings = extractAddedToppings(query);

  // Determine product code
  let code: string | undefined;
  let baseToppings: ToppingOptions;

  if (specialty && specialty in SPECIALTY_PIZZAS) {
    // Specialty pizza — use specialty code if available for this size, else fall back
    const specialtyCodes = SPECIALTY_PIZZAS[specialty];
    code = specialtyCodes[size] || specialtyCodes['large'] || Object.values(specialtyCodes)[0];
    baseToppings = { ...(SPECIALTY_TOPPINGS[specialty] || SPECIALTY_TOPPINGS.cheese) };
  } else if (specialty && specialty in SPECIALTY_TOPPINGS) {
    // Named flavor (pepperoni, cheese, etc.) but not a specialty product code
    const crustCodes = PIZZA_CODES[crust] || PIZZA_CODES.hand_tossed;
    code = crustCodes[size] || crustCodes['large'] || Object.values(crustCodes)[0];
    baseToppings = { ...SPECIALTY_TOPPINGS[specialty] };
  } else {
    // Plain cheese pizza on requested crust
    const crustCodes = PIZZA_CODES[crust] || PIZZA_CODES.hand_tossed;
    code = crustCodes[size] || crustCodes['large'] || Object.values(crustCodes)[0];
    baseToppings = { ...SPECIALTY_TOPPINGS.cheese };
  }

  if (!code || !MENU_ITEMS[code]) return null;

  // Apply topping modifications
  const toppings: ToppingOptions = {};
  for (const [k, v] of Object.entries(baseToppings)) {
    if (!removedToppings.has(k)) {
      toppings[k] = { ...v };
    }
  }
  for (const [toppingCode, amount] of addedToppings) {
    if (!removedToppings.has(toppingCode)) {
      toppings[toppingCode] = { '1/1': amount };
    }
  }

  // Build notes summarizing customizations
  const notesParts: string[] = [];
  if (removedToppings.size > 0) {
    const names = [...removedToppings].map(c => TOPPING_CODE_NAMES[c] || c);
    notesParts.push(`No ${names.join(', ')}`);
  }
  if (addedToppings.size > 0) {
    const names = [...addedToppings.entries()].map(([c, a]) => {
      const label = a === '1.5' ? 'Extra ' : a === '0.5' ? 'Light ' : a === '2' ? 'Double ' : '';
      return `${label}${TOPPING_CODE_NAMES[c] || c}`;
    });
    notesParts.push(`Add ${names.join(', ')}`);
  }

  return {
    menuItem: MENU_ITEMS[code],
    qty: 1,
    toppings,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
  };
}

// ---------------------------------------------------------------------------
// Non-pizza item detection
// ---------------------------------------------------------------------------

function extractSideItems(query: string): OrderItem[] {
  const items: OrderItem[] = [];
  const q = query.toLowerCase();
  const usedCodes = new Set<string>();

  const matchers: { pattern: RegExp; code: string }[] = [
    // Wings
    { pattern: /buffalo\s*wing/i, code: 'W08PHOTW' },
    { pattern: /bbq\s*wing/i, code: 'W08PBBQW' },
    { pattern: /boneless\s*wing/i, code: 'W08PBNLW' },
    { pattern: /\bwing/i, code: 'W08PHOTW' },
    // Bread
    { pattern: /bread\s*bite/i, code: 'B16PBIT' },
    { pattern: /cheesy\s*bread|stuffed\s*bread/i, code: 'B8PCSCB' },
    { pattern: /\bbreadstick/i, code: 'BREADSTIX' },
    { pattern: /\bcinnamon/i, code: 'CINNASTIX' },
    // Drinks
    { pattern: /\bcoke\b|coca.*cola/i, code: '2LCOKE' },
    { pattern: /\bsprite\b/i, code: '2LSPRITE' },
    { pattern: /\bwater\b/i, code: 'BOTTLWATER' },
    // Desserts
    { pattern: /lava\s*cake|chocolate\s*cake/i, code: 'B3PCLAVA' },
    { pattern: /brownie|cookie\s*brownie/i, code: 'MARBRWNE' },
    // Pasta
    { pattern: /\bpasta\b|\bcarbonara\b/i, code: 'PINPASCA' },
    // Sandwiches
    { pattern: /italian\s*sandwich/i, code: 'PSANSAITAL' },
    { pattern: /\bphilly\b(?!.*pizza)/i, code: 'PSANSAPH' },
    { pattern: /\bsandwich\b/i, code: 'PSANSAITAL' },
  ];

  for (const { pattern, code } of matchers) {
    if (pattern.test(q) && !usedCodes.has(code) && MENU_ITEMS[code]) {
      usedCodes.add(code);
      items.push({ menuItem: MENU_ITEMS[code], qty: 1 });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Default combo
// ---------------------------------------------------------------------------

function defaultComboItems(): OrderItem[] {
  return [
    { menuItem: MENU_ITEMS['14SCREEN'], qty: 1, toppings: SPECIALTY_TOPPINGS.pepperoni },
    { menuItem: MENU_ITEMS['W08PHOTW'], qty: 1 },
    { menuItem: MENU_ITEMS['B16PBIT'], qty: 1 },
    { menuItem: MENU_ITEMS['2LCOKE'], qty: 1 },
    { menuItem: MENU_ITEMS['MARINARA'], qty: 2 },
  ];
}

// ---------------------------------------------------------------------------
// Detect whether the query mentions a pizza at all
// ---------------------------------------------------------------------------

function mentionsPizza(query: string): boolean {
  return /pizza|extravagan|deluxe|meatz|pepperoni|hawaiian|veggie|thin\s*crust|brooklyn|hand\s*tossed|pan\s*pizza|cheese\s*pizza|large\b.*\border|small\b.*\border|medium\b.*\border/i.test(query);
}

// ---------------------------------------------------------------------------
// Build submission JSON
// ---------------------------------------------------------------------------

function buildOrderJson(
  storeId: string,
  serviceMethod: 'Delivery' | 'Carryout',
  paymentType: 'Cash' | 'Card',
  orderItems: OrderItem[],
): DominosOrderSubmission {
  return {
    storeId,
    customerName: DEFAULT_CUSTOMER.name,
    customerPhone: DEFAULT_CUSTOMER.phone,
    customerEmail: DEFAULT_CUSTOMER.email,
    address: { ...DEFAULT_ADDRESS },
    items: orderItems.map(({ menuItem, qty, toppings }) => ({
      code: menuItem.code,
      quantity: qty,
      ...(toppings ? { options: toppings as unknown as Record<string, string> } : {}),
    })),
    paymentType,
    serviceMethod,
  };
}

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

function formatMarkdown(
  order: DominosOrderSubmission,
  orderItems: OrderItem[],
): string {
  const lines: string[] = [];

  lines.push('## Sample Dominos Order');
  lines.push('');
  lines.push(`**Store:** ${order.storeId} | **Service:** ${order.serviceMethod} | **Payment:** ${order.paymentType}`);
  lines.push(`**Customer:** ${order.customerName} (${order.customerPhone})`);
  if (order.serviceMethod === 'Delivery') {
    lines.push(`**Address:** ${order.address.street}, ${order.address.city}, ${order.address.state} ${order.address.zip}`);
  }

  // Items
  let total = 0;
  for (let i = 0; i < orderItems.length; i++) {
    const { menuItem, qty, toppings, notes } = orderItems[i];
    const lineTotal = menuItem.price * qty;
    total += lineTotal;

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`### ${i + 1}. ${menuItem.name}`);
    lines.push(`**Code:** \`${menuItem.code}\` | **Qty:** ${qty} | **Price:** $${lineTotal.toFixed(2)}`);

    if (notes) {
      lines.push(`**Customizations:** ${notes}`);
    }

    // Topping detail for pizzas
    if (toppings && Object.keys(toppings).length > 0) {
      lines.push('');
      lines.push('**Toppings:**');
      for (const [code, positions] of Object.entries(toppings)) {
        const amount = positions['1/1'] || '1';
        const amountLabel = amount === '0' ? 'none' : amount === '0.5' ? 'Light' : amount === '1' ? 'Normal' : amount === '1.5' ? 'Extra' : amount === '2' ? 'Double' : amount;
        const toppingName = TOPPING_CODE_NAMES[code] || code;
        lines.push(`- ${toppingName}: ${amountLabel}`);
      }
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`**Estimated Total:** $${total.toFixed(2)} *(before tax & fees)*`);

  // JSON block
  lines.push('');
  lines.push('### Order JSON');
  lines.push('```json');
  lines.push(JSON.stringify(order, null, 2));
  lines.push('```');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill entry
// ---------------------------------------------------------------------------

async function execute(query: string): Promise<SkillResult> {
  const storeId = extractStoreId(query);
  const serviceMethod = extractServiceMethod(query);
  const paymentType = extractPaymentType(query);

  const items: OrderItem[] = [];

  // Build pizza if mentioned
  if (mentionsPizza(query)) {
    const pizza = buildPizza(query);
    if (pizza) items.push(pizza);
  }

  // Add non-pizza items
  items.push(...extractSideItems(query));

  // If nothing was detected, use default combo
  const finalItems = items.length > 0 ? items : defaultComboItems();

  const order = buildOrderJson(storeId, serviceMethod, paymentType, finalItems);
  const markdown = formatMarkdown(order, finalItems);

  return { success: true, markdown, data: order };
}

export const sampleOrderSkill: SkillEntry = {
  id: 'sample-order',
  label: 'Create Sample Order',
  category: 'dominos-orders',
  sampleQuery: 'Create a sample order',
  triggers: [
    /create\s+(?:a\s+)?(?:sample\s+)?(?:\w+\s+)*order/i,
    /(?:build|generate|make)\s+(?:a\s+|an\s+)?(?:\w+\s+)*order/i,
    /sample\s+(?:\w+\s+)*order/i,
    /example\s+(?:\w+\s+)*order/i,
    /test\s+(?:\w+\s+)*order/i,
  ],
  execute,
};
