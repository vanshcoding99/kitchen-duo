const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// "1 1/2 cups" -> { amount: 1.5, unit: "cups" }
// "Pinch"      -> { amount: null, unit: "pinch" }
function parseMeasure(text) {
  const clean = (text || '').trim().toLowerCase();
  if (!clean) return { amount: null, unit: null };

  const match = clean.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(.*)$/);
  if (!match) return { amount: null, unit: clean };

  const numberPart = match[1];
  const rest = match[2] || null;

  // ranges like "1-2" are kept as text instead of guessing
  if (rest && rest.startsWith('-')) return { amount: null, unit: clean };
  let amount;

  if (numberPart.includes('/')) {
    const pieces = numberPart.split(/\s+/);
    const fraction = pieces[pieces.length - 1].split('/');
    const whole = pieces.length === 2 ? Number(pieces[0]) : 0;
    amount = whole + Number(fraction[0]) / Number(fraction[1]);
  } else {
    amount = Number(numberPart);
  }

  return { amount, unit: rest };
}

async function seedMeal(meal) {
  const exists = await pool.query('SELECT id FROM recipes WHERE name = $1', [meal.strMeal]);
  if (exists.rows.length > 0) return false;

  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const item = (meal['strIngredient' + i] || '').trim();
    if (!item) continue;
    const { amount, unit } = parseMeasure(meal['strMeasure' + i]);
    ingredients.push({ item, amount, unit });
  }

  const summary = ingredients
    .map((g) => [g.amount, g.unit, g.item].filter((x) => x !== null && x !== '').join(' '))
    .join(', ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recipe = await client.query(
      'INSERT INTO recipes (name, servings, ingredients, instructions) VALUES ($1, $2, $3, $4) RETURNING id',
      [meal.strMeal, 4, summary, meal.strInstructions]
    );
    for (const g of ingredients) {
      await client.query(
        'INSERT INTO ingredients (recipe_id, item, amount, unit) VALUES ($1, $2, $3, $4)',
        [recipe.rows[0].id, g.item, g.amount, g.unit]
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  let added = 0;
  let skipped = 0;

  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const res = await fetch('https://www.themealdb.com/api/json/v1/1/search.php?f=' + letter);
    const data = await res.json();
    for (const meal of data.meals || []) {
      const wasAdded = await seedMeal(meal);
      if (wasAdded) added++;
      else skipped++;
    }
    console.log('Letter ' + letter + ' done. Added so far: ' + added);
  }

  console.log('Finished. Added ' + added + ' recipes, skipped ' + skipped + ' that already existed.');
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { parseMeasure };