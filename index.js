const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

function requireKey(req, res, next) {
  const key = req.get('x-api-key');
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).send('Missing or wrong key');
  }
  next();
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).send('Please log in');
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).send('Login expired or invalid');
  }
}

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

app.post('/recipes', requireKey, async (req, res) => {
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

app.post('/recipes/:id/ingredients', requireKey, async (req, res) => {
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

app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || password.length < 8) {
    return res.status(400).send('Need an email and a password of at least 8 characters');
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase().trim(), hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).send('That email is already registered');
    }
    console.error(err);
    res.status(500).send('Could not register');
  }
});
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send('Need an email and a password');
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));

    if (!ok) {
      return res.status(401).send('Wrong email or password');
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not log in');
  }
});

app.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});