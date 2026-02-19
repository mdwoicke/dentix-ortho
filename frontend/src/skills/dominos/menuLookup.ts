/**
 * Menu Lookup Skill
 *
 * Searches the Dominos product catalog by name, code, or category and returns
 * matching items with their menu codes, descriptions, and categories.
 *
 * Runs entirely from a local catalog — no API call needed.
 *
 * Handles queries like:
 *   "what is the menu code for a large Extravaganza"
 *   "menu code for pepperoni pizza"
 *   "look up wings"
 *   "what codes are there for thin crust"
 *   "show me all pasta items"
 *   "find the code for lava cakes"
 */

import type { SkillEntry, SkillResult } from './types';

// ---------------------------------------------------------------------------
// Complete product catalog (mirrors PRODUCT_NAMES from DominosOrders.tsx)
// ---------------------------------------------------------------------------

interface CatalogItem {
  code: string;
  name: string;
  category: string;
}

const CATALOG: CatalogItem[] = [
  // Pizzas - Hand Tossed
  { code: '10SCREEN', name: 'Small (10") Hand Tossed Cheese Pizza', category: 'Pizza' },
  { code: '12SCREEN', name: 'Medium (12") Hand Tossed Cheese Pizza', category: 'Pizza' },
  { code: '14SCREEN', name: 'Large (14") Hand Tossed Cheese Pizza', category: 'Pizza' },
  { code: '16SCREEN', name: 'Extra Large (16") Hand Tossed Cheese Pizza', category: 'Pizza' },
  // Pizzas - Thin Crust
  { code: '10THIN', name: 'Small (10") Crunchy Thin Crust Cheese Pizza', category: 'Pizza' },
  { code: '12THIN', name: 'Medium (12") Crunchy Thin Crust Cheese Pizza', category: 'Pizza' },
  { code: '14THIN', name: 'Large (14") Crunchy Thin Crust Cheese Pizza', category: 'Pizza' },
  { code: '14TEXTRAV', name: 'Large (14") Thin Crust ExtravaganZZa Pizza', category: 'Pizza' },
  { code: '14TMEATZA', name: 'Large (14") Thin Crust MeatZZa Feast Pizza', category: 'Pizza' },
  // Pizzas - Handmade Pan
  { code: 'P10IGFZA', name: 'Small (10") Handmade Pan Cheese Pizza', category: 'Pizza' },
  { code: 'P10IGFDX', name: 'Small (10") Handmade Pan Deluxe Pizza', category: 'Pizza' },
  { code: 'P10IGFPH', name: 'Small (10") Handmade Pan Philly Cheese Steak Pizza', category: 'Pizza' },
  { code: 'P12IPAZA', name: 'Medium (12") Handmade Pan Cheese Pizza', category: 'Pizza' },
  { code: 'P12IPAMX', name: 'Medium (12") Handmade Pan Memphis BBQ Chicken Pizza', category: 'Pizza' },
  { code: 'P12IPAPV', name: 'Medium (12") Handmade Pan Pacific Veggie Pizza', category: 'Pizza' },
  { code: 'P12PSCZA', name: 'Medium (12") Handmade Pan Specialty Pizza', category: 'Pizza' },
  { code: 'P12PSCPV', name: 'Medium (12") Handmade Pan Pacific Veggie Pizza', category: 'Pizza' },
  { code: 'P12PSCUH', name: 'Medium (12") Handmade Pan Ultimate Pepperoni Pizza', category: 'Pizza' },
  { code: 'P_14SCREEN', name: 'Large (14") Handmade Pan Cheese Pizza', category: 'Pizza' },
  { code: 'PPAN', name: 'Handmade Pan Cheese Pizza', category: 'Pizza' },
  // Pizzas - Brooklyn Style
  { code: 'P12IBKZA', name: 'Medium (12") Brooklyn Style Cheese Pizza', category: 'Pizza' },
  { code: 'P14IRECK', name: 'Large (14") Brooklyn Style Wisconsin Cheese Pizza', category: 'Pizza' },
  { code: 'P14IRESC', name: 'Large (14") Brooklyn Style Spinach & Feta Pizza', category: 'Pizza' },
  { code: 'P14ITHSC', name: 'Large (14") Brooklyn Style Honolulu Hawaiian Pizza', category: 'Pizza' },
  { code: 'P14ITPEP', name: 'Large (14") Brooklyn Style Pepperoni Pizza', category: 'Pizza' },
  { code: 'P16IBKZA', name: 'Extra Large (16") Brooklyn Style Cheese Pizza', category: 'Pizza' },
  { code: 'P16IBKZZ', name: 'Extra Large (16") Brooklyn Style Cheese Pizza', category: 'Pizza' },
  { code: 'PBKIREZA', name: 'Brooklyn Style Cheese Pizza', category: 'Pizza' },
  { code: 'PBKIREDX', name: 'Brooklyn Style Deluxe Pizza', category: 'Pizza' },
  // Specialty Pizzas
  { code: '10SCDELUX', name: 'Small (10") Hand Tossed Deluxe Pizza', category: 'Pizza' },
  { code: '12SCDELUX', name: 'Medium (12") Hand Tossed Deluxe Pizza', category: 'Pizza' },
  { code: '12SCEXTRAV', name: 'Medium (12") Hand Tossed ExtravaganZZa Pizza', category: 'Pizza' },
  { code: '12SCMEATZA', name: 'Medium (12") Hand Tossed MeatZZa Feast Pizza', category: 'Pizza' },
  { code: '14SCDELUX', name: 'Large (14") Hand Tossed Deluxe Pizza', category: 'Pizza' },
  { code: '14SCEXTRAV', name: 'Large (14") Hand Tossed ExtravaganZZa Pizza', category: 'Pizza' },
  { code: '14SCMEATZA', name: 'Large (14") Hand Tossed MeatZZa Feast Pizza', category: 'Pizza' },
  { code: '14SCPFEAST', name: 'Large (14") Hand Tossed Pepperoni Feast Pizza', category: 'Pizza' },
  { code: 'CEABBQC', name: 'Chicken & Applewood Bacon BBQ Pizza', category: 'Pizza' },
  { code: 'PHLLYSTEAK', name: 'Philly Cheese Steak Pizza', category: 'Pizza' },
  { code: 'P14ITHPZA', name: 'Large (14") Hand Tossed Italian Sausage & Peppers Pizza', category: 'Pizza' },
  { code: 'P12IPHCZA', name: 'Medium (12") Handmade Pan Philly Cheese Steak Pizza', category: 'Pizza' },
  // Gluten Free
  { code: 'P10IGFZA_GF', name: 'Small (10") Gluten Free Crust Cheese Pizza', category: 'Pizza' },
  // Wings - Bone-In
  { code: 'W08PPLNW', name: 'Plain Chicken Wings (8 Piece)', category: 'Wings' },
  { code: 'W08PHOTW', name: 'Hot Buffalo Chicken Wings (8 Piece)', category: 'Wings' },
  { code: 'W08PMLDW', name: 'Mild Buffalo Chicken Wings (8 Piece)', category: 'Wings' },
  { code: 'W08PBBQW', name: 'Sweet BBQ Bacon Chicken Wings (8 Piece)', category: 'Wings' },
  { code: 'W08PGPMW', name: 'Garlic Parmesan Chicken Wings (8 Piece)', category: 'Wings' },
  { code: 'W08PMANW', name: 'Mango Habanero Chicken Wings (8 Piece)', category: 'Wings' },
  { code: 'W16PPLNW', name: 'Plain Chicken Wings (16 Piece)', category: 'Wings' },
  { code: 'W16PHOTW', name: 'Hot Buffalo Chicken Wings (16 Piece)', category: 'Wings' },
  { code: 'W16PBBQW', name: 'Sweet BBQ Bacon Chicken Wings (16 Piece)', category: 'Wings' },
  { code: 'W32PMANW', name: 'Mango Habanero Chicken Wings (32 Piece)', category: 'Wings' },
  { code: 'W40PPLNW', name: 'Plain Chicken Wings (40 Piece)', category: 'Wings' },
  // Wings - Boneless
  { code: 'W08PBNLW', name: 'Boneless Chicken Wings (8 Piece)', category: 'Wings' },
  { code: 'W16PBNLW', name: 'Boneless Chicken Wings (16 Piece)', category: 'Wings' },
  // Chicken Bites
  { code: 'CKRGHTB', name: 'Spicy Crispy Chicken Bites', category: 'Chicken' },
  { code: 'CKRGSBQ', name: 'Sweet BBQ Crispy Chicken Bites', category: 'Chicken' },
  { code: 'CKRGSJP', name: 'Jalapeno Crispy Chicken Bites', category: 'Chicken' },
  // Bread
  { code: 'B16PBIT', name: 'Parmesan Bread Bites (16 Piece)', category: 'Bread' },
  { code: 'B16GBIT', name: 'Garlic Bread Bites (16 Piece)', category: 'Bread' },
  { code: 'B32PBIT', name: 'Parmesan Bread Bites (32 Piece)', category: 'Bread' },
  { code: 'B32GBIT', name: 'Garlic Bread Bites (32 Piece)', category: 'Bread' },
  { code: 'B8PCSCB', name: 'Stuffed Cheesy Bread (8 Piece)', category: 'Bread' },
  { code: 'B8PCSBJ', name: 'Stuffed Cheesy Bread with Jalapeno (8 Piece)', category: 'Bread' },
  { code: 'B8PCSPP', name: 'Stuffed Cheesy Bread with Pepperoni (8 Piece)', category: 'Bread' },
  { code: 'B8PCSSF', name: 'Stuffed Cheesy Bread with Spinach & Feta (8 Piece)', category: 'Bread' },
  { code: 'B8PCCT', name: 'Bread Bowl Pasta - Chicken Alfredo', category: 'Bread' },
  { code: 'BREADSTIX', name: 'Classic Garden Fresh Breadsticks (8 Piece)', category: 'Bread' },
  { code: 'CINNASTIX', name: 'Cinnamon Bread Twists with Sweet Icing (8 Piece)', category: 'Bread' },
  { code: 'CKRGCBT', name: 'Chicken Carbonara Bread Bowl Pasta', category: 'Bread' },
  { code: 'PINBBLCB', name: 'Italian Sausage Marinara Bread Bowl Pasta', category: 'Bread' },
  { code: 'B2PCLB', name: 'Stuffed Cheesy Bread with Cheese & Bacon (8 Piece)', category: 'Bread' },
  { code: 'B2PCJB', name: 'Stuffed Cheesy Bread with Jalapeno & Bacon (8 Piece)', category: 'Bread' },
  { code: 'B2PCBB', name: 'Stuffed Cheesy Bread with Bacon (8 Piece)', category: 'Bread' },
  { code: 'B2PCSBG', name: 'Stuffed Cheesy Bread with Spinach & Feta (8 Piece)', category: 'Bread' },
  { code: 'PARBITES', name: 'Parmesan Bread Bites', category: 'Bread' },
  { code: 'STCHZBD', name: 'Stuffed Cheesy Bread (8 Piece)', category: 'Bread' },
  // Drinks
  { code: '2LCOKE', name: '2-Liter Coca-Cola Classic', category: 'Drinks' },
  { code: '2LDCOKE', name: '2-Liter Diet Coke', category: 'Drinks' },
  { code: '2LSPRITE', name: '2-Liter Sprite', category: 'Drinks' },
  { code: '2LDRPEPPER', name: '2-Liter Dr Pepper', category: 'Drinks' },
  { code: '2LMMORANGE', name: '2-Liter Minute Maid Orange', category: 'Drinks' },
  { code: '2LTBPIBB', name: '2-Liter Pibb Xtra', category: 'Drinks' },
  { code: '2LMTDEW', name: '2-Liter Mountain Dew', category: 'Drinks' },
  { code: '20BCOKE', name: '20 oz Coca-Cola Classic Bottle', category: 'Drinks' },
  { code: '20BDCOKE', name: '20 oz Diet Coke Bottle', category: 'Drinks' },
  { code: '20BSPRITE', name: '20 oz Sprite Bottle', category: 'Drinks' },
  { code: '20BDRPEP', name: '20 oz Dr Pepper Bottle', category: 'Drinks' },
  { code: 'BOTTLWATER', name: 'Dasani Bottled Water (20 oz)', category: 'Drinks' },
  // Desserts
  { code: 'MARBRWNE', name: "Domino's Marbled Cookie Brownie (9 Piece)", category: 'Dessert' },
  { code: 'B16CBIT', name: 'Cinnamon Bread Bites (16 Piece)', category: 'Dessert' },
  { code: 'B3PCLAVA', name: 'Chocolate Lava Crunch Cakes (3 Piece)', category: 'Dessert' },
  { code: 'CINNATWST', name: 'Cinnamon Bread Twists with Sweet Icing (8 Piece)', category: 'Dessert' },
  { code: 'CHOCLAVAC', name: 'Chocolate Lava Crunch Cakes (2 Piece)', category: 'Dessert' },
  // Pasta
  { code: 'PASTA', name: 'Build Your Own Pasta', category: 'Pasta' },
  { code: 'PINPASCA', name: 'Chicken Carbonara Pasta in a Bread Bowl', category: 'Pasta' },
  { code: 'PINPASPP', name: 'Pasta Primavera in a Bread Bowl', category: 'Pasta' },
  { code: 'PINPASBD', name: 'Build Your Own Pasta in a Bread Bowl', category: 'Pasta' },
  { code: 'PINPASBUFF', name: 'Spicy Buffalo 5-Cheese Mac & Cheese in a Bread Bowl', category: 'Pasta' },
  { code: 'PINPASIM', name: 'Italian Sausage Marinara Pasta in a Bread Bowl', category: 'Pasta' },
  { code: 'PINPAS5CMC', name: 'Five Cheese Mac & Cheese in a Bread Bowl', category: 'Pasta' },
  // Salads
  { code: 'PPSGARSA', name: 'Classic Garden Salad', category: 'Salad' },
  { code: 'PPSCSRSA', name: 'Chicken Caesar Salad', category: 'Salad' },
  // Sandwiches
  { code: 'PSANSAITAL', name: 'Italian Sandwich', category: 'Sandwich' },
  { code: 'PSANSACH', name: 'Chicken Habanero Sandwich', category: 'Sandwich' },
  { code: 'PSANSACP', name: 'Chicken Parm Sandwich', category: 'Sandwich' },
  { code: 'PSANSAPH', name: 'Philly Cheese Steak Sandwich', category: 'Sandwich' },
  { code: 'PSANSABC', name: 'Buffalo Chicken Sandwich', category: 'Sandwich' },
  { code: 'PSANSACB', name: 'Chicken Bacon Ranch Sandwich', category: 'Sandwich' },
  { code: 'PBITESAND', name: 'Mediterranean Veggie Sandwich', category: 'Sandwich' },
  { code: 'PCSANDW', name: 'Chicken Parm Sandwich', category: 'Sandwich' },
  // Sides / Dipping Sauces
  { code: 'RANCH', name: 'Ranch Dipping Cup', category: 'Sides' },
  { code: 'MARINARA', name: 'Marinara Dipping Cup', category: 'Sides' },
  { code: 'BLUECHS', name: 'Blue Cheese Dipping Cup', category: 'Sides' },
  { code: 'GARBUTTER', name: 'Garlic Butter Dipping Cup', category: 'Sides' },
  { code: 'HOTSAUCE', name: 'Hot Sauce Dipping Cup', category: 'Sides' },
  { code: 'ICING', name: 'Sweet Icing Dipping Cup', category: 'Sides' },
  { code: 'REASRP', name: 'Kicker Hot Sauce Dipping Cup', category: 'Sides' },
  { code: 'SIDEJAL', name: 'Side of Jalapenos', category: 'Sides' },
  { code: 'CEAHABC', name: 'Crispy Chicken & Bacon Caesar Salad', category: 'Salad' },
  // Tots
  { code: 'CHEDBACON', name: 'Cheddar Bacon Loaded Tots', category: 'Tots' },
  { code: 'M3CHEESE', name: 'Melty 3-Cheese Loaded Tots', category: 'Tots' },
];

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

function extractKeywords(query: string): string[] {
  let cleaned = query.toLowerCase();
  // Strip trigger/noise phrases
  cleaned = cleaned.replace(
    /\b(what(?:'s|\s+is|\s+are)?|the|menu|code[s]?|item[s]?|product[s]?|for|a|an|show|find|look\s*up|search|get|list|tell\s+me|do\s+you\s+have|dominos?|coder?)\b/gi,
    '',
  );
  return cleaned.split(/\s+/).filter(t => t.length > 1);
}

function matchScore(item: CatalogItem, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const searchable = `${item.code} ${item.name} ${item.category}`.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (searchable.includes(kw)) hits++;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatMarkdown(keywords: string[], matches: CatalogItem[]): string {
  const lines: string[] = [];
  const searchLabel = keywords.join(' ');

  lines.push(`## Menu Lookup: ${searchLabel}`);
  lines.push('');

  if (matches.length === 0) {
    lines.push(`No menu items found matching **${searchLabel}**.`);
    lines.push('');
    lines.push('Try using different keywords like "pepperoni", "wings", "thin crust", "lava cake", etc.');
    return lines.join('\n');
  }

  lines.push(`Found **${matches.length}** matching item${matches.length === 1 ? '' : 's'}:`);

  // Group by category
  const grouped = new Map<string, CatalogItem[]>();
  for (const item of matches) {
    const cat = item.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  for (const [category, items] of grouped) {
    lines.push('');
    lines.push(`### ${category}`);
    lines.push('');

    for (const item of items) {
      lines.push(`- \`${item.code}\` — ${item.name}`);
    }
  }

  // If single result, highlight it clearly
  if (matches.length === 1) {
    const item = matches[0];
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`The menu code for **${item.name}** is \`${item.code}\`.`);
    lines.push('');
    lines.push('Use this code in the `items[].code` field when building an order:');
    lines.push('```json');
    lines.push(JSON.stringify({ code: item.code, quantity: 1 }, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill entry
// ---------------------------------------------------------------------------

async function execute(query: string): Promise<SkillResult> {
  const keywords = extractKeywords(query);

  if (keywords.length === 0) {
    // No meaningful keywords — show category summary
    const categories = new Map<string, number>();
    for (const item of CATALOG) {
      categories.set(item.category, (categories.get(item.category) || 0) + 1);
    }
    const lines = ['## Dominos Menu Catalog', ''];
    lines.push(`**${CATALOG.length}** items across ${categories.size} categories:`);
    lines.push('');
    for (const [cat, count] of categories) {
      lines.push(`- **${cat}**: ${count} items`);
    }
    lines.push('');
    lines.push('Ask about specific items — e.g. "menu code for large extravaganza" or "look up wings".');
    return { success: true, markdown: lines.join('\n'), data: { categories: Object.fromEntries(categories) } };
  }

  const scored = CATALOG
    .map(item => ({ item, score: matchScore(item, keywords) }))
    .filter(s => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.name.localeCompare(b.item.name);
    });

  const matches = scored.map(s => s.item).slice(0, 30);
  const markdown = formatMarkdown(keywords, matches);

  return { success: true, markdown, data: { keywords, matches } };
}

export const menuLookupSkill: SkillEntry = {
  id: 'menu-lookup',
  label: 'Menu Code Lookup',
  triggers: [
    /(?:what(?:'s|\s+is|\s+are)?\s+)?(?:the\s+)?menu\s+code/i,
    /(?:look\s*up|find|search|show|get)\s+(?:the\s+)?(?:menu\s+)?(?:code|item)/i,
    /(?:code|item)\s+for\s+(?:a\s+)?(?:large|medium|small|extra)/i,
    /what\s+(?:code|item)\s+/i,
    /menu\s+(?:item|lookup|search)/i,
    /(?:what|which)\s+(?:is|are)\s+(?:the\s+)?(?:code|product)/i,
  ],
  execute,
};
