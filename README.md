# Kitchen Duo

A cooking app that answers one question: what are we making tomorrow, and how much of everything do I need?

You pick a dish, say paneer butter masala. You get the recipe. You change the number of servings, and the amounts change with it. After you cook, you upload a photo and earn points, because dinner should feel a little like winning.

**Live backend:** https://kitchen-duo.onrender.com

(It runs on a free server that naps when nobody visits. If the first load takes about 30 seconds, it's just waking up.)

## Why I'm building this

It started with a simple request from someone close to me who wanted a better way to plan meals. Every recipe site I tried was either buried in ads or built for people who already know what an "emulsion" is. I wanted something small, warm and useful, so I'm building it myself, one piece at a time.

## Where it stands today

The backend is live and talking to a real database. You can read recipes and add new ones through the API. The recipe scaler, the photo points and the front end are next. I'd rather show you a small thing that works than a big thing that doesn't.

## How it works

Three pieces, like a restaurant:

* **Express (Node.js)** is the waiter. It takes requests and brings back answers.
* **PostgreSQL on Supabase** is the kitchen, where every recipe is stored.
* **Render** is the building, and it keeps the whole thing open to the public.

A request goes from the browser to Express to Postgres, and the answer travels back the same way.

## Routes

| Method | Route | What it does |
|---|---|---|
| GET | `/` | Says the server is alive |
| GET | `/db-test` | Asks the database for the current time, to prove the connection works |
| GET | `/recipes` | Returns every recipe |
| POST | `/recipes` | Adds a new recipe |

Adding a recipe:

```bash
curl -X POST https://kitchen-duo.onrender.com \
  -H "Content-Type: application/json" \
  -d '{"name":"Dal Tadka","servings":4,"ingredients":"1 cup toor dal, 1 onion, 2 tomatoes, ghee, cumin","instructions":"Boil dal, make tadka, mix."}'
```

## Run it yourself

```bash
git clone https://github.com/vanshcoding99/kitchen-duo.git
cd kitchen-duo
npm install
```

Create a `.env` file with your own Postgres connection string:

```
DATABASE_URL="your-postgres-connection-string"
```

Then start it:

```bash
npm start
```

It runs at `http://localhost:3000`.

## Built with

Node.js, Express, PostgreSQL, Supabase, Render, and the `pg` and `dotenv` packages.

## Things that broke along the way

My first database connection took about an hour and a half to fix. The code was fine. My password contained an `@` and a `#`, and both mean something special inside a connection URL, so the app kept reading half my password as the server address. I changed the password and it worked on the next try. Lesson learned: when everything looks right and nothing works, check the boring stuff first.

## What's next

1. A recipe scaler, so 2 servings becomes 4 and the amounts update
2. Ingredients split into their own table, with amounts and units
3. A front end you can actually use on your phone
4. Photo uploads and points

## About me

I'm Vansh, a Computing Science student at Thompson Rivers University in Kamloops, BC. Kitchen Duo is the project where I'm learning how real software gets built, one broken thing at a time.