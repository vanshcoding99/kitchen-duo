// ============================================================
// Kitchen Duo backend: index.js
// This one file is the whole server.
// You start it with: node index.js
// The code is the same as before. Only the comments are new.
// ============================================================


// ============================================================
// PART 1: SETUP. Load the tools this file needs.
// ============================================================

// "dns" is a tool built into Node. It turns website names into numbers
// (addresses), the way a phone book turns names into phone numbers.
const dns = require('dns');

// Use the older style of address (IPv4) first. This fixed the Supabase
// connection problem we had earlier.
dns.setDefaultResultOrder('ipv4first');

// dotenv reads your .env file and puts each line into process.env.
// That is how the code can use secrets like process.env.DATABASE_URL
// without the secrets being written inside the code itself.
require('dotenv').config();

// Express helps us build a web server. We tell it which addresses to
// answer and what to say. Those addresses are called "routes".
const express = require('express');

// Pool is a small group of ready-made database connections.
// We reuse them instead of opening a new connection every time.
const { Pool } = require('pg');

// bcrypt scrambles passwords (this is called hashing),
// so we never store a real password.
const bcrypt = require('bcrypt');

// jsonwebtoken makes and checks login tokens.
// A token is a signed pass that proves who you are.
const jwt = require('jsonwebtoken');

// Make the Express app. "app" is our server. We attach routes to it below.
const app = express();

// The door number the server listens on.
// Render gives us a PORT. On your Mac we use 3000.
const PORT = process.env.PORT || 3000;

// "Middleware" is a step that every request passes through before it
// reaches a route. This one reads JSON sent to us and puts it in req.body.
app.use(express.json());

// This middleware shares the files in the "public" folder (your web page)
// exactly as they are.
app.use(express.static('public'));


// ============================================================
// PART 2: DOOR CHECKS. Small functions that guard routes.
// ============================================================

// requireKey: the secret-key guard.
// A route that uses it only works if the request carries your ADMIN_KEY.
// req = the request coming in. res = the answer we send back.
// next = the function that says "OK, continue to the real route".
function requireKey(req, res, next) {
  // Read the key from the header named x-api-key.
  const key = req.get('x-api-key');
  // No key, or a wrong key: stop here and answer 401 (not allowed).
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).send('Missing or wrong key');
  }
  // The key is right, so let the request carry on.
  next();
}

// requireAuth: the login guard.
// A route that uses it only works if the request carries a valid token.
function requireAuth(req, res, next) {
  // The token travels in the Authorization header as: Bearer <token>
  const header = req.get('authorization') || '';
  // If the header starts with "Bearer ", cut that part off and keep the
  // token. Otherwise there is no token.
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  // No token at all: answer 401 and stop.
  if (!token) {
    return res.status(401).send('Please log in');
  }
  // try/catch: try something that can fail, and handle the failure.
  try {
    // jwt.verify checks the token is real and has not expired, using
    // JWT_SECRET. If it is real, it gives back what is inside the token
    // (id and email). We save that on req.user for later routes to use.
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    // A fake or expired token ends up here.
    res.status(401).send('Login expired or invalid');
  }
}


// ============================================================
// PART 3: DATABASE. Connect to Supabase.
// ============================================================

// Make the pool. DATABASE_URL (from .env) holds the address, username and
// password of your Supabase database.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});


// ============================================================
// PART 4: CACHE. A whiteboard in the kitchen.
// ============================================================

// CACHE (piece 1): the whiteboard and how long it stays fresh

// A Map is a set of labelled boxes. We keep the saved recipe list in a
// box named 'recipes'. It lives in the server's memory, so it is wiped
// every time the server restarts.
const cache = new Map();

// How long the saved list counts as fresh: 60 seconds.
// Computers count time in milliseconds, and 1000 ms is one second.
const CACHE_TTL_MS = 60 * 1000;


// ============================================================
// PART 5: ROUTES. Each one answers one address.
// "GET" means "give me something". "POST" means "here is new data".
// ============================================================

// GET / : the home address. A quick way to check the server is alive.
app.get('/', (req, res) => {
  res.send('Kitchen Duo backend is alive!');
});

// GET /db-test : asks the database for the current time.
// If you see a date, the database connection works.
// "async" lets us use "await", which means "wait here until the database
// answers, then carry on".
app.get('/db-test', async (req, res) => {
  try {
    // pool.query sends a question to the database in a language called SQL.
    const result = await pool.query('SELECT NOW()');
    // result.rows is the list of answers. We send back the first one.
    res.send(result.rows[0]);
  } catch (err) {
    // Print the real error in your Terminal so you can read it.
    console.error(err);
    // Send a short message to the visitor. 500 means "server problem".
    res.status(500).send('Database connection failed');
  }
});

// CACHE (piece 2): check the whiteboard first, then Postgres

// GET /recipes : the list of all recipes.
app.get('/recipes', async (req, res) => {
  // Open the 'recipes' box on the whiteboard. It is empty (undefined)
  // if nothing has been saved yet.
  const cached = cache.get('recipes');

  // Two things must both be true: the box has something in it, AND the
  // current time (Date.now()) is still before its expiry time.
  if (cached && Date.now() < cached.expires) {
    // A label on the answer, so we can see this came from the cache.
    // HIT means "found it on the whiteboard".
    res.set('X-Cache', 'HIT');
    // Send the saved list. "return" stops the function here, so the
    // database code below never runs.
    return res.json(cached.data);
  }

  // Nothing fresh on the whiteboard, so we ask the database as usual.
  try {
    // SELECT * means "all columns". ORDER BY id puts them in order.
    const result = await pool.query('SELECT * FROM recipes ORDER BY id');
    // Write the list on the whiteboard, with the time it stops being fresh
    // (now plus 60 seconds).
    cache.set('recipes', {
      data: result.rows,
      expires: Date.now() + CACHE_TTL_MS,
    });
    // MISS means "had to ask the database".
    res.set('X-Cache', 'MISS');
    // Send the list as JSON.
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not fetch recipes');
  }
});

// POST /recipes : add a new recipe. Needs your secret key (requireKey).
app.post('/recipes', requireKey, async (req, res) => {
  // Pull four named values out of the JSON that was sent (req.body).
  const { name, servings, ingredients, instructions } = req.body;

  // A recipe must have a name. 400 means "the request was incomplete".
  if (!name) {
    return res.status(400).send('Recipe name is required');
  }

  try {
    // INSERT adds a new row. $1, $2, $3, $4 are placeholders that get
    // filled from the list on the next line. This keeps harmful text from
    // being run as SQL (it is called protection from SQL injection).
    // servings || 2 means "use servings, or 2 if none was sent".
    // RETURNING * gives us back the row that was just saved.
    const result = await pool.query(
      'INSERT INTO recipes (name, servings, ingredients, instructions) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, servings || 2, ingredients, instructions]
    );
    // CACHE (piece 3): the list changed, so erase the whiteboard
    // Now the next GET /recipes will fetch a fresh list.
    cache.delete('recipes');
    // 201 means "created". Send back the new recipe.
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not add recipe');
  }
});

// GET /recipes/:id/scaled?servings=6 : a recipe with amounts scaled to the
// number of servings you want. ":id" is a blank filled in by the address,
// for example /recipes/1/scaled.
app.get('/recipes/:id/scaled', async (req, res) => {
  // Everything in an address arrives as text, so Number() turns it into
  // a number.
  const id = Number(req.params.id);
  const wanted = Number(req.query.servings);

  // The id must be a whole number and servings must be more than 0.
  if (!Number.isInteger(id) || !(wanted > 0)) {
    return res.status(400).send('Use /recipes/1/scaled?servings=6');
  }

  try {
    // Find the recipe with this id.
    const recipe = await pool.query('SELECT * FROM recipes WHERE id = $1', [id]);
    // No rows means there is no such recipe. 404 means "not found".
    if (recipe.rows.length === 0) {
      return res.status(404).send('Recipe not found');
    }

    // Get every ingredient that belongs to this recipe.
    const ingredients = await pool.query(
      'SELECT item, amount, unit FROM ingredients WHERE recipe_id = $1 ORDER BY id',
      [id]
    );

    // The scaling number. Example: you want 8 servings and the recipe is
    // for 4, so the factor is 2 and every amount doubles.
    const factor = wanted / recipe.rows[0].servings;

    // map goes through every ingredient and builds a new, scaled one.
    const scaled = ingredients.rows.map((row) => ({
      item: row.item,
      unit: row.unit,
      // If there is no amount (null), keep it null. Otherwise multiply by
      // the factor and round to 2 decimal places.
      amount: row.amount === null ? null : Math.round(Number(row.amount) * factor * 100) / 100,
    }));

    // Send everything back as JSON.
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

// POST /recipes/:id/ingredients : add one ingredient to a recipe.
// Needs your secret key (requireKey).
app.post('/recipes/:id/ingredients', requireKey, async (req, res) => {
  const id = Number(req.params.id);
  // Pull the three values out of the JSON that was sent.
  const { item, amount, unit } = req.body;

  // Need a whole-number id and an ingredient name.
  if (!Number.isInteger(id) || !item) {
    return res.status(400).send('Need a recipe id and an item name');
  }
  // If an amount was given, it must be a real number.
  if (amount !== undefined && amount !== null && !Number.isFinite(Number(amount))) {
    return res.status(400).send('Amount must be a number');
  }

  try {
    // Check the recipe exists before adding to it.
    const recipe = await pool.query('SELECT id FROM recipes WHERE id = $1', [id]);
    if (recipe.rows.length === 0) {
      return res.status(404).send('Recipe not found');
    }

    // Add the ingredient row. "amount ?? null" means "use amount, but if it
    // is missing use null". Same for unit.
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


// ============================================================
// PART 6: ACCOUNTS. Register, log in, and check who you are.
// ============================================================

// POST /register : make a new account.
app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  // Need an email and a password of at least 8 characters.
  if (!email || !password || password.length < 8) {
    return res.status(400).send('Need an email and a password of at least 8 characters');
  }

  try {
    // Scramble the password. The 10 is how much work the scrambling takes.
    // More work makes guessing passwords slower for an attacker.
    const hash = await bcrypt.hash(password, 10);
    // Save the email and the scrambled password. The real password is never
    // saved. toLowerCase().trim() makes A@x.com and a@x.com the same, and
    // removes extra spaces. RETURNING id, email sends back the new account
    // without the scrambled password.
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase().trim(), hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // 23505 is the database saying "this must be unique, and it is not".
    // That means the email is already registered. 409 means "conflict".
    if (err.code === '23505') {
      return res.status(409).send('That email is already registered');
    }
    console.error(err);
    res.status(500).send('Could not register');
  }
});

// POST /login : check the email and password, and give back a token.
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send('Need an email and a password');
  }

  try {
    // Look up the account by email.
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    // The first row found, or undefined if there is no such email.
    const user = result.rows[0];
    // If the account exists, compare the typed password with the scrambled
    // one. bcrypt.compare never unscrambles anything. It scrambles the
    // typed password the same way and checks if the results match.
    const ok = user && (await bcrypt.compare(password, user.password_hash));

    // The same message for a wrong email and a wrong password, so nobody
    // can use this to find out which emails have accounts.
    if (!ok) {
      return res.status(401).send('Wrong email or password');
    }

    // Make the token: a signed pass holding the id and email.
    // Only your server can make a valid one, because only it knows
    // JWT_SECRET. It stops working after 7 days.
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

// GET /me : shows who is logged in. requireAuth runs first, so this only
// works with a valid token. req.user was filled in by requireAuth.
app.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});


// ============================================================
// PART 7: START. Open the door and wait for visitors.
// ============================================================

// Start the server on PORT and print a message in the Terminal.
// After this line, Node stays running and waits for requests.
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});