const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.get('/', (req, res) => {
  res.send('Kitchen Duo backend is alive!');
});

app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database connection failed');
  }
});

app.get('/recipes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM recipes ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not fetch recipes');
  }
});

app.post('/recipes', async (req, res) => {
  const { name, servings, ingredients, instructions } = req.body;

  if (!name) {
    return res.status(400).send('Recipe name is required');
  }

  try {
    const result = await pool.query(
      'INSERT INTO recipes (name, servings, ingredients, instructions) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, servings || 2, ingredients, instructions]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not add recipe');
  }
});
app.get('/recipes/:id/scaled', async (req, res) => {
  const id = Number(req.params.id);
  const wanted = Number(req.query.servings);

  if (!Number.isInteger(id) || !(wanted > 0)) {
    return res.status(400).send('Use /recipes/1/scaled?servings=6');
  }

  try {
    const recipe = await pool.query('SELECT * FROM recipes WHERE id = $1', [id]);
    if (recipe.rows.length === 0) {
      return res.status(404).send('Recipe not found');
    }

    const ingredients = await pool.query(
      'SELECT item, amount, unit FROM ingredients WHERE recipe_id = $1 ORDER BY id',
      [id]
    );

    const factor = wanted / recipe.rows[0].servings;

    const scaled = ingredients.rows.map((row) => ({
      item: row.item,
      unit: row.unit,
      amount: row.amount === null ? null : Math.round(Number(row.amount) * factor * 100) / 100,
    }));

    res.json({
      name: recipe.rows[0].name,
      original_servings: recipe.rows[0].servings,
      servings: wanted,
      ingredients: scaled,
      instructions: recipe.rows[0].instructions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not scale recipe');
  }
});
app.post('/recipes/:id/ingredients', async (req, res) => {
  const id = Number(req.params.id);
  const { item, amount, unit } = req.body;

  if (!Number.isInteger(id) || !item) {
    return res.status(400).send('Need a recipe id and an item name');
  }
  if (amount !== undefined && amount !== null && !Number.isFinite(Number(amount))) {
    return res.status(400).send('Amount must be a number');
  }

  try {
    const recipe = await pool.query('SELECT id FROM recipes WHERE id = $1', [id]);
    if (recipe.rows.length === 0) {
      return res.status(404).send('Recipe not found');
    }

    const result = await pool.query(
      'INSERT INTO ingredients (recipe_id, item, amount, unit) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, item, amount ?? null, unit ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not add ingredient');
  }
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});