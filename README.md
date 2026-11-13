# The Pod Café

A way to track which Nespresso pods we have tried and scored.

Built with Node.js 26 LTS, Express 5, EJS, Bootstrap 5 and MongoDB Atlas (via Mongoose). Each user keeps a private list of pods with intensity (1–13), flavour, a score out of 10 (one decimal place), tasting notes and the date tried. Admins can manage other accounts.

## Contents

- [Run it locally](#run-it-locally)
- [Set up MongoDB Atlas (step by step)](#set-up-mongodb-atlas-step-by-step)
- [Make yourself an admin](#make-yourself-an-admin)
- [Tests](#tests)
- [Run with Docker](#run-with-docker)
- [Deploy to Render](#deploy-to-render)
- [Project structure](#project-structure)

## Run it locally

1. Install [Node.js 26 LTS](https://nodejs.org/) (`node -v` should print `v26.x`).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the example environment file and fill it in (see the Atlas guide below for `MONGODB_URI`):

   ```bash
   cp .env.example .env
   ```

   Generate a `SESSION_SECRET` with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. Start the dev server (restarts automatically when you change files):

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>, create an account and start adding pods.

`.env` is loaded by Node's built-in `--env-file-if-exists` flag, so no extra package is needed. Never commit `.env`.

## Set up MongoDB Atlas (step by step)

MongoDB Atlas has a free-forever **M0** tier (512 MB), which is plenty for this app.

1. **Create an account** at <https://www.mongodb.com/cloud/atlas/register> and sign in.
2. **Create a cluster**
   - Click **Create** (or **Build a Database**).
   - Choose **M0 Free**.
   - Pick a provider and the region closest to where you will host on Render (e.g. AWS / Frankfurt `eu-central-1` if your Render service is in Frankfurt).
   - Name it (e.g. `podcafe`) and click **Create Deployment**.
3. **Create a database user** (Atlas will prompt you; otherwise go to **Security → Database Access → Add New Database User**).
   - Authentication method: **Password**.
   - Username: e.g. `podcafe-app`.
   - Click **Autogenerate Secure Password** and copy it somewhere safe.
   - Role: **Read and write to any database**.
   - Click **Add User**.
4. **Allow network access** (**Security → Network Access → Add IP Address**).
   - Click **Add Current IP Address** so your computer can connect.
   - For Render, also add `0.0.0.0/0` (**Allow access from anywhere**). Render's free tier has no fixed outbound IP, so this is required; the database is still protected by the username and strong password.
5. **Get the connection string**
   - Go to **Database → Clusters → Connect → Drivers**.
   - Driver: **Node.js**. Copy the string, which looks like:

     ```text
     mongodb+srv://podcafe-app:<db_password>@podcafe.abcde.mongodb.net/?retryWrites=true&w=majority&appName=podcafe
     ```

6. **Fill in the password and the database name.** Replace `<db_password>` with your password, and add a database name after `.net/`:
   - Local development: `.../podcafe-dev?retryWrites=true...`
   - Production (Render): `.../podcafe?retryWrites=true...`

   Using two database names on the same free cluster keeps test data out of production. If the password contains special characters like `@`, `:` or `/`, [URL-encode](https://www.urlencoder.org/) it.
7. Put the local string in `.env` as `MONGODB_URI=...`.
8. **Check it works:** run `npm run dev`, register, add a pod, then in Atlas open **Database → Browse Collections**. You should see `podcafe-dev` with `users`, `pods` and `sessions` collections.

## Make yourself an admin

There is no admin sign-up page; you promote an existing account directly in the database.

1. Register normally in the app (e.g. username `jayne`).
2. Use **one** of the options below.

**Option A: Atlas web UI**

1. In Atlas go to **Database → Browse Collections**.
2. Open the `podcafe` database (or `podcafe-dev` locally) → `users` collection.
3. In the filter box enter `{ "username": "jayne" }` and click **Apply**.
4. Hover over the document and click the **pencil (Edit)** icon.
5. Change `role` from `"user"` to `"admin"` and click **Update**.

**Option B: mongosh (MongoDB Shell)**

1. Install [mongosh](https://www.mongodb.com/try/download/shell).
2. In Atlas click **Connect → Shell** and copy the command, e.g.

   ```bash
   mongosh "mongodb+srv://podcafe.abcde.mongodb.net/" --apiVersion 1 --username podcafe-app
   ```

3. Run:

   ```js
   use podcafe
   db.users.updateOne({ username: "jayne" }, { $set: { role: "admin" } })
   ```

   You should see `matchedCount: 1, modifiedCount: 1`.

Refresh the app and an **Admin** link appears in the navbar. Admins can:

- list and search users
- view a user's pods (read-only)
- promote/demote admins
- disable/enable accounts (disabled users are signed out on their next request)
- delete an account and all its pods
- set a temporary password, which is shown once; the user must change it at their next login

Admins cannot change their own account from the admin area, so you can't accidentally lock yourself out.

There is no self-service password reset. Any logged-in user can change their own password from the key icon in the navbar.

## Tests

Tests use [Vitest](https://vitest.dev/), [Supertest](https://github.com/ladjs/supertest) and [mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server), so they never touch your Atlas data.

```bash
npm test               # run once
npm run test:watch     # re-run on change
npm run test:coverage  # with coverage report (fails under 80% lines)
```

The first run downloads a MongoDB binary (~100 MB), so it takes a little longer.

GitHub Actions (`.github/workflows/ci.yml`) runs the tests with coverage on every push and pull request.

## Run with Docker

```bash
docker build -t podcafe .
docker run --rm --env-file .env -p 3000:3000 podcafe
```

Then open <http://localhost:3000>.

## Deploy to Render

1. Push this repository to GitHub.
2. In Atlas, make sure `0.0.0.0/0` is in **Network Access** (step 4 above).
3. In the [Render dashboard](https://dashboard.render.com/) click **New → Web Service** and connect the GitHub repo.
4. Settings:
   - **Runtime:** Node
   - **Build command:** `npm ci`
   - **Start command:** `npm start`
   - **Instance type:** Free (or Starter to avoid sleeping)
5. **Environment variables:**

   | Key | Value |
   | --- | --- |
   | `MONGODB_URI` | Your Atlas string using the `podcafe` database |
   | `SESSION_SECRET` | A new long random string (not the same as local) |
   | `NODE_ENV` | `production` |

   Render sets `PORT` automatically. The Node version comes from `.node-version` (`26`).
6. Click **Create Web Service** and watch the logs for `The Pod Café is open`.
7. Set the **Health Check Path** to `/healthz` (Settings → Health & Alerts).
8. Open your `https://<name>.onrender.com` URL, register, then [make yourself an admin](#make-yourself-an-admin) against the `podcafe` database.

Free tier notes:

- The service sleeps after ~15 minutes without traffic; the first request afterwards takes up to a minute.
- Your data lives in Atlas, so it is not affected by Render restarts or redeploys.

If Render's native Node runtime doesn't offer Node 26 yet, choose **Runtime: Docker** instead; it uses the included `Dockerfile` (`node:26-alpine`).

## Project structure

```text
src/
  server.js            # loads env, connects to MongoDB, starts HTTP server
  app.js               # Express app: security, sessions, CSRF, routes, errors
  config/db.js
  middleware/          # auth (loadUser, requireAuth, requireAdmin), flash
  models/              # User, Pod
  routes/              # auth, pods, stats, account, admin
  utils/               # podQuery (search/sort), format helpers
  validators/          # express-validator rules
  views/               # EJS templates (partials, pods, auth, admin, account)
public/                # CSS, JS, logo
tests/
  unit/                # validators, query builder, model/format helpers
  integration/         # auth, pods, stats, account, admin (Supertest)
```

## Security notes

- Passwords are hashed with bcrypt (cost 12); login responses don't reveal whether a username exists.
- Sessions are stored in MongoDB with `HttpOnly`, `SameSite=Lax` and (in production) `Secure` cookies, and are regenerated on login.
- Every form is protected by a CSRF token; login/register are rate limited.
- Helmet sets a strict Content Security Policy (no inline scripts); Bootstrap is served locally.
- Every pod query is scoped to the logged-in user, so users can never read or change each other's pods.
