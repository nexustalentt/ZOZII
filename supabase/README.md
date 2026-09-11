# Supabase Setup

This folder contains the SQL needed to set up the backend for the HireMe User Access Management system.

## How to apply

1. Open the **Supabase Dashboard** → project `usdesrkwivnsjgjaobyf` → **SQL Editor**.
2. Run the migrations **in order** — each one is idempotent and safe to re-run:
   - `migrations/001_rpc_functions.sql` — **creates the base tables** (`app_users`,
     `access_history`, indexes, trigger, RLS) **and** the core RPC functions.
     (Running `schema.sql` is optional — 001 is self-contained.)
   - `migrations/002_usage_tracking.sql` — adds the usage-budget columns and
     upgrades the access RPCs from a pure countdown to usage-based timing.
   - `migrations/003_identity_email.sql` — email becomes the identity; the
     EXE registers with email, legacy usernames still log in.
   - `migrations/004_plan_requests.sql` — free-trial + plan requests.
3. After each batch, run:
   ```sql
   notify pgrst, 'reload schema';
   ```

> If you ever see `relation "public.app_users" does not exist`, migration 001 was
> not applied (it owns the base tables). Re-run 001 first, then the rest in order.

## Usage-based timing model (v2)

Access time is now **consumed only while the user is actually listening/recording**
in the EXE, not from the moment the admin grants it:

- Admin grants **minutes of usage** (Set Duration / Reset Time). The budget stays
  full until the user starts listening.
- EXE **Start** → `usage_start()` opens the meter. **Stop** / pause → `usage_stop()`
  banks the elapsed seconds. While listening a `usage_heartbeat()` runs every 15s
  so a crash loses at most one heartbeat gap.
- When the budget hits 0 the user is flagged `EXPIRED` and can no longer start.
- A **custom expiry** (Set Duration → Custom / Reset Time → Custom) still uses the
  old wall-clock countdown for users you want to expire at a fixed date/time,
  independent of usage.

## Free trial & plan requests (v4)

- **New registrations** are immediately `ACTIVE` on a trial: **10 minutes of usage
  budget** (server-enforced) plus a **10-question cap** (enforced in the EXE).
  No admin action is needed to try the app. Accounts left `INACTIVE` by the
  pre-trial schema are automatically back-filled onto the same trial.
- When the trial runs out (minutes exhausted OR 10 questions asked), the EXE shows
  a **"Get More Access"** prompt with presets (5m / 10m / 30m / 1h) or a custom
  number of minutes. Hitting **Send** writes a `PENDING` row in `plan_requests`.
- The **dashboard** shows these under **Access Requests** — use **Open User** to
  jump to that user's drawer and grant time with the existing Set Duration /
  Reset Time / Extend controls. Granting time automatically:
  - flips the user to `plan_type='paid'` (removes the 10-question cap, no expiry prompt),
  - marks their pending request `GRANTED` (removes it from the request list),
  - leaves every other existing control untouched.

## Admin key (optional)

The dashboard is deliberately **no-login**. To prevent anyone with the dashboard URL
from controlling users, optionally set an admin key that all admin functions require:

```sql
-- In the SQL editor, once per database:
select set_config('app.admin_key', 'REPLACE_WITH_STRONG_KEY', false);
```

Then put the same value in `website/.env` as `VITE_ADMIN_KEY`. When the admin key is
left empty, admin functions are open (matches the "no auth" choice).

> Note: `current_setting` values set with `select set_config('...', value, false)` do not
> persist across DB restarts. For a persistent key, either set it via the dashboard
> (Settings → Database → "Extra parameters" / database config) or use `ALTER DATABASE ... SET app.admin_key = '...'`.

## Security notes

- Passwords are hashed with `crypt()`/bcrypt — never stored in plaintext.
- All expiry math uses the **server clock** (`now()`), never the client or EXE.
- Tables have RLS enabled and no direct public policies; all access goes through
  SECURITY DEFINER functions.
- The EXE calls `register_user`, `validate_access`, and the `usage_*` functions
  (usage timing) only — never admin functions.
