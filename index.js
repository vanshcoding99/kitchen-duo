const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});