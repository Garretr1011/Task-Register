# Task Register

Static site (no build step) backed by Supabase for storage and auth, deployed on Vercel.

## Stack
- Plain HTML/CSS/JS, no framework, no bundler
- Supabase: Postgres table + Auth (email/password) + Row Level Security
- Vercel: hosts the static files, gives you a URL

## 1. Supabase setup

1. Open your Supabase project (create a new one if you want this separate from anything else).
2. Go to **SQL Editor > New query**, paste the contents of `schema.sql`, and run it. This creates the `tasks` table and locks it down with Row Level Security so a row is only visible to the user who owns it.
3. Go to **Authentication > Users > Add user**. Create yourself an account with your email and a password. There's no public sign-up screen in this app on purpose, since it's just for you.
4. Go to **Project Settings > API**. Copy the **Project URL** and the **anon public** key.

## 2. Configure the app

Open `config.js` and replace the two placeholder values:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```

The anon key is meant to be public and ships to the browser either way — it's the RLS policies from `schema.sql` that actually keep your data private, not hiding this key.

## 3. Push to GitHub

From this folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/task-register.git
git push -u origin main
```

(Create the empty repo on GitHub first if you haven't.)

## 4. Deploy on Vercel

1. In Vercel, **Add New > Project**, import the GitHub repo you just pushed.
2. Framework Preset: choose **Other**.
3. Build Command: leave blank.
4. Output Directory: leave as `./` (root).
5. Deploy.

You'll get a `*.vercel.app` URL. Open it, sign in with the email/password you created in Supabase step 3.

## Notes

- To add tasks from your phone, just open the Vercel URL there and sign in — no app install needed.
- If you ever want a custom domain instead of `*.vercel.app`, that's a Vercel project setting, not something in this codebase.
- Recurring task completion is tracked per calendar date, so ticking off a Monday task doesn't mark it done forever.
- Any open "Today" task that isn't completed rolls forward to the next day automatically, with a "Moved Nx" flag so it doesn't disappear silently.
