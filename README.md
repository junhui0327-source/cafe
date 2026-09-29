<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/28311c53-cc9a-4296-857a-3c5d57061b18

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase Setup

1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project's API settings. Use only the public anon/publishable key in the browser; never use a `service_role` or secret key.
2. In the Supabase SQL Editor, open and run [`supabase/schema.sql`](supabase/schema.sql):

```sql
```

3. Restart the dev server after changing `.env.local`. New orders are saved in Supabase. The on-page recent-order list only shows orders submitted during the current browser session; there is no public read policy, so customer names and phone numbers are not exposed to visitors.
