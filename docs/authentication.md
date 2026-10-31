# Authentication setup

Vetted signs people in with **Google** through Supabase Auth. There are no passwords and no separate sign-up form: the first OAuth sign-in creates the account, later ones sign in to it.

## How it works

1. `/login` posts to the `signInWithProvider` Server Action ([src/app/auth/actions.ts](../src/app/auth/actions.ts)), which calls `signInWithOAuth()` and redirects to Google.
2. Google sends the user back through Supabase to `/auth/callback` ([src/app/auth/callback/route.ts](../src/app/auth/callback/route.ts)), which exchanges the one-time code for a session stored in HTTP cookies (PKCE flow).
3. On a first sign-in, Supabase inserts into `auth.users` and the `on_auth_user_created` trigger creates the matching `public.profiles` row.
4. [src/proxy.ts](../src/proxy.ts) refreshes the session and redirects signed-out visitors away from `/dashboard`, `/assessment` and `/results`, and signed-in visitors away from `/login`. Server Components re-verify the session through `getCurrentUser()` ([src/lib/auth.ts](../src/lib/auth.ts)) rather than trusting the proxy alone.
5. **Sign out** calls the `signOut` Server Action, which clears the session cookies and returns to `/login`.

Failures (the user clicks *Cancel* on the consent screen, an expired code, a Google outage) land back on `/login?error=…` with a plain-language message.

## 1. Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Project Settings → API Keys**: copy the project URL and the **publishable** key.
3. Copy `.env.example` to `.env.local` and fill in:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

4. Apply the migration. Either run the Supabase CLI:

   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   or paste [supabase/migrations/20261031000000_create_profiles.sql](../supabase/migrations/20261031000000_create_profiles.sql) into **SQL Editor** and run it.

5. **Authentication → Sign In / Providers**: turn off **Email** (and Phone) so Google is the only way in. Leave **Allow new users to sign up** on, since first-time OAuth users need it.

## 2. Redirect URLs in Supabase

**Authentication → URL Configuration**:

| Setting       | Value                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Site URL      | `http://localhost:3000` locally; your production URL once deployed          |
| Redirect URLs | `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` |

Supabase only redirects to URLs on this list, so a missing entry sends users to the Site URL instead of the callback. For Vercel preview deployments you can add `https://*-<team>.vercel.app/auth/callback`.

## 3. Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name (Vetted), support email and logo. Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000` and your production URL
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret** into Supabase **Authentication → Sign In / Providers → Google**, and enable it.

The redirect URI points at **Supabase**, not at the app. Supabase then forwards to `/auth/callback`.

## 4. Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000/login. Run on port 3000 to match the redirect URLs above, or add your port to both Supabase and the provider settings.

## Data model

`public.profiles`

| Column       | Type          | Notes                                    |
| ------------ | ------------- | ---------------------------------------- |
| `id`         | `uuid`        | Primary key, references `auth.users(id)`, cascades on delete |
| `full_name`  | `text`        | From provider metadata; may be null      |
| `email`      | `text`        | From the auth user                       |
| `avatar_url` | `text`        | `avatar_url` or `picture` from Google    |
| `provider`   | `text`        | Always `google`                          |
| `created_at` | `timestamptz` | Defaults to `now()`                      |

Row Level Security is enabled. Signed-in users can read, insert and update only their own row, and can update only `full_name` and `avatar_url`; `email` and `provider` come from the provider and are not user-editable. Anonymous visitors have no access.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Back on the landing page after consent instead of `/dashboard` | `/auth/callback` is missing from Supabase **Redirect URLs** |
| `redirect_uri_mismatch` from Google | Google's authorized redirect URI must be `https://<project-ref>.supabase.co/auth/v1/callback` |
| "We couldn't complete sign-in" | The code expired or was reused; try again. Check **Authentication → Logs** in Supabase |
| `Missing Supabase configuration` error | `.env.local` is missing values; restart `npm run dev` after editing it |
| Signed in but the dashboard shows no member-since date | The migration wasn't applied, so there's no profile row |
