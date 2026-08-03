# Deploying the Financial Aid Offer Analyzer (free, no account needed for viewers)

This is a static page (`index.html`) plus one small serverless function (`api/extract.js`)
that calls Google's free Gemini API. Vercel hosts both together for free.

## 1. Get your Gemini API key
- Go to aistudio.google.com, sign in, click "Get API key" → "Create API key."
- Copy the key. Do NOT put it in this code or share it anywhere public.

## 2. Deploy to Vercel

### Option A — no local setup, using GitHub + Vercel's website
1. Create a free GitHub account if you don't have one (github.com).
2. Create a new repository and upload these three files: `index.html`, `vercel.json`,
   and the `api/extract.js` file (keep it inside a folder named `api`).
3. Go to vercel.com, sign up free (you can sign up with your GitHub account), click
   "Add New Project," and import the repository you just created.
4. Before clicking Deploy, open "Environment Variables" and add:
   - Name: `GEMINI_API_KEY`
   - Value: (paste the key you copied in step 1)
5. Click Deploy. Vercel gives you a URL like `https://your-project.vercel.app` —
   that's your shareable link. No Claude account, no sign-in, works for anyone.

### Option B — using the command line (if you have Node.js installed)
1. Open a terminal in this folder.
2. Run: `npx vercel`
3. Follow the prompts (log in / create a free Vercel account when asked).
4. When it asks about environment variables, or once the project exists, run:
   `npx vercel env add GEMINI_API_KEY` and paste your key when prompted.
5. Run `npx vercel --prod` to get your final production URL.

## 3. Test it
Open the URL Vercel gives you in a private/incognito window (to confirm it works
with no login) and try uploading one of your sample letters.

## Notes
- The Gemini free tier is rate-limited (roughly 10 requests/minute, 500/day as of
  now — check aistudio.google.com for current limits). Fine for a colleague demo,
  not for heavy simultaneous use.
- If you ever want to update the code, just re-upload the changed files to your
  GitHub repo (Option A) or re-run `npx vercel --prod` (Option B) — same URL.
- To take the site down, delete the project from your Vercel dashboard.
