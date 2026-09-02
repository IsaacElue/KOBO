# Kobo Deployment

Getting `backend/` and `frontend/` off localhost and reachable at real URLs.

- **Frontend** (`frontend/`, Next.js) → **Vercel** → `https://kobopayments.com`
- **Backend** (`backend/`, Express) → **Railway** → `https://api.kobopayments.com`

This is infra only. No application logic changed. The one code change is
multi-origin CORS in `backend/src/index.ts` (see §6).

---

## 0. Prerequisite — push the current work to `main`

Railway and Vercel deploy from GitHub `main`. As of writing, `main` is behind
local: the **MoonPay on-ramp integration** and these **deploy config** changes
are committed locally? Check `git status` / `git log origin/main..HEAD`. Both
must be on `main` before a deploy reflects reality:

```
git push origin main
```

`main` after this should contain: `backend/railway.json`, `engines` in both
`package.json`s, the multi-origin CORS in `backend/src/index.ts`, the MoonPay
lib + webhook route.

---

## 1. Railway — backend

I can't do these steps for you (they need your Railway login + a GitHub OAuth
grant). Walkthrough:

1. **New Project → Deploy from GitHub repo → `IsaacElue/KOBO`.**
2. On the service: **Settings → Source → Root Directory = `backend`.**
   Railway then picks up `backend/railway.json` (Nixpacks, `npm run start`,
   `/health` healthcheck).
3. **Settings → Networking → Generate Domain** (gives a temporary
   `*.up.railway.app` — useful for the first smoke test before DNS).
4. Set the environment variables from §3 (**Variables** tab). Do **not** upload
   a `.env` file.
5. Add the **backend wallet volume** — see §4.
6. Deploy. Watch **Deployments → Logs** for `API listening on port <PORT>`.

**If the build fails on `tsc: not found`:** add Variable
`NPM_CONFIG_PRODUCTION=false` (forces devDependencies to install for the build).
Nixpacks normally handles this, but some builds need it explicit.

**Auto-deploy:** on by default for pushes to `main`. Leave it.

---

## 2. Vercel — frontend

Same — needs your Vercel login + GitHub grant.

1. **Add New → Project → Import `IsaacElue/KOBO`.**
2. **Root Directory = `frontend`.** Framework Preset auto-detects **Next.js**.
   Leave build/output/install commands on their defaults.
3. Set the environment variables from §3 (all environments, or Production +
   Preview as you prefer).
4. Deploy. First deploy lands on `*.vercel.app` — smoke-test that before DNS.
5. Auto-deploy on push to `main` is on by default.

---

## 3. Environment variables — walkthrough

### Backend (Railway → Variables)

| Variable | Value for the deploy | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://eognjbeylxlsmjyifvse.supabase.co` | same Supabase project as local |
| `SUPABASE_SERVICE_ROLE_KEY` | *(the service-role JWT from local `.env`)* | **secret** |
| `SUPABASE_DB_URL` | — | **skip.** Only used by `scripts/run-migration.ts`, not the running app. Add temporarily only if you want to run a migration from the Railway shell. |
| `SOLANA_RPC_URL` | `https://devnet.helius-rpc.com/?api-key=…` | same Helius devnet URL as local (still devnet) |
| `BACKEND_WALLET_KEYPAIR_PATH` | `/data/backend-wallet.json` | **required on Railway** — see §4 |
| `ONRAMP_PROVIDER` | `moonpay` | |
| `MOONPAY_PUBLISHABLE_KEY` | `pk_test_…` | sandbox key — fine for a staging deploy |
| `MOONPAY_SECRET_KEY` | `sk_test_…` | **secret** |
| `MOONPAY_WEBHOOK_KEY` | `wk_test_…` | **secret** |
| `MOONPAY_CRYPTO_CURRENCY_CODE` | `pyusd_sol` | sandbox has no `usdc_sol`; flip to `usdc_sol` only with live keys |
| `MOONPAY_ALLOWED_IP_OVERRIDE` | **UNSET** | ⚠️ local-only. Behind Railway's proxy, `req.ip` (with `TRUST_PROXY`) is the real client IP. Setting this would pin every MoonPay session to one IP. |
| `MOONPAY_REDIRECT_URL` | *(optional)* `https://kobopayments.com` | where MoonPay returns the user post-purchase; leave blank for now |
| `TRANSAK_API_KEY` | `f653eca8-…` | ⚠️ **required even though provider=moonpay** — `lib/transak.ts` throws at import if missing, and it's imported for the `GET /rate` price feed |
| `TRANSAK_API_SECRET` | *(from local `.env`)* | **secret**, same reason |
| `TRANSAK_ENV` | `staging` | |
| `TRANSAK_REFERRER_DOMAIN` | *(optional)* `kobopayments.com` | has a default; only matters if you swap `ONRAMP_PROVIDER=transak` |
| `CROSSMINT_API_KEY` | `sk_staging_…` | ⚠️ **secret, and REQUIRED — the backend crashes at boot without it.** `lib/crossmint.ts` *and* `lib/crossmint-onramp.ts` both `throw` at import; the latter also rejects anything that isn't an `sk_staging_` key. |
| `CROSSMINT_WEBHOOK_SECRET` | *(optional)* `whsec_…` | **secret.** Only needed once the Crossmint webhook endpoint is registered — until then `POST /webhooks/crossmint` returns `503` (not a crash). |
| `CROSSMINT_ENABLE_CREDIT` | **UNSET** | Leave false/unset for the demo — a Crossmint success webhook routes to `manual_review`, never auto-credits. |
| `FRONTEND_ORIGIN` | `https://kobopayments.com,https://www.kobopayments.com,http://localhost:3000` | multi-origin (new — see §6). Keep localhost so you can run the frontend locally against prod. |
| `TRUST_PROXY` | **UNSET** | Leave unset. The code default (`loopback, uniquelocal, 100.64.0.0/10`) already covers Railway's proxy range and resolves `req.ip` to the first public IP. A fixed `1` was wrong on Railway (landed on the internal `100.64.x.x` hop). |
| `PORT` | **UNSET** | Railway injects it. Code falls back to `4000` locally. |
| `DEV_SKIP_AUTH` | **UNSET** | ⚠️ **never in a deployed env.** Bypasses auth entirely. |

### Frontend (Vercel → Environment Variables)

| Variable | Value for the deploy | Notes |
|---|---|---|
| `NEXT_PUBLIC_KOBO_API_URL` | `https://api.kobopayments.com` | unset ⇒ mock mode; setting it turns on real backend mode |
| `NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID` | `a8b7ac31-01c7-4541-9d56-f9aa52d6b10e` | same real `users.id` as local — **must be a real `users` row in the deployed Supabase project** (see §8) |
| `NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_WALLET` | `Guur9ickFMJHxhutjvsMYZh76175eFu4kUUqGTTX8M8h` | same as local |
| `NEXT_PUBLIC_MOONPAY_PUBLISHABLE_KEY` | `pk_test_…` | must match backend `MOONPAY_PUBLISHABLE_KEY`. Used by the browser IP self-check before Add Funds. Publishable — safe in the bundle. |
| `NEXT_PUBLIC_CROSSMINT_CLIENT_KEY` | `ck_staging_…` | client-side key for the "Card / Apple Pay" embedded checkout. Its allowed origins (Crossmint console) must include the real frontend origin. Without it that option renders a "not configured" card. |
| `NEXT_PUBLIC_DEV_SKIP_AUTH` | **UNSET** | ⚠️ **never on Vercel.** With it unset the real Supabase auth gate is live (login/signup/PIN). The GoTrue timeout fix means a degraded Supabase now returns a visible 503 instead of hanging — but the login screen *is* the real one. |

> All `NEXT_PUBLIC_*` values are compiled into the browser bundle and are
> public. None of the above is a secret; keep it that way.

---

## 4. Backend wallet keypair (Railway volume)

`backend/src/lib/solana.ts` loads the pooled wallet from
`BACKEND_WALLET_KEYPAIR_PATH` (default `backend/keys/backend-wallet.json`,
gitignored) and **generates + writes a fresh one if the file is absent**.

Railway's container filesystem is ephemeral → without persistence the wallet
address changes on every deploy and any devnet USDC funded to it is stranded.

**Fix (no code change):**

1. Railway service → **Settings → Volumes → New Volume**, mount path `/data`.
2. Set `BACKEND_WALLET_KEYPAIR_PATH=/data/backend-wallet.json`.
3. First boot generates the keypair on the volume; it persists across deploys.
4. Get the address (Railway shell: `node -e "console.log(require('@solana/web3.js').Keypair.fromSecretKey(new Uint8Array(require('/data/backend-wallet.json'))).publicKey.toBase58())"`), then fund it with devnet USDC + a little SOL for fees — same as the local wallet.

Until this is done, `/health`, `/rate`, `/market/overview` work fine (they
don't touch the wallet), but `POST /transfers` settlement and any real
on-chain movement won't.

**Alternative (small code change, if you'd rather not use a volume):** load the
keypair from an env var instead of a file. Not done here — you said no logic
changes. Flag it if you want it.

---

## 5. DNS records

You add these at your registrar once the projects exist. **Confirm the exact
target strings against what each dashboard shows for your project** — providers
occasionally hand out project-specific values.

### `api.kobopayments.com` → Railway

1. Railway service → **Settings → Networking → Custom Domain** →
   `api.kobopayments.com`.
2. Railway shows a **CNAME target** (looks like `xxxxxxxx.up.railway.app`).
3. Add:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | `CNAME` | `api` | *(the value Railway shows)* | 3600 |

### `kobopayments.com` + `www` → Vercel

1. Vercel project → **Settings → Domains** → add `kobopayments.com` **and**
   `www.kobopayments.com` (set one to redirect to the other — apex as primary
   is fine).
2. Vercel shows the records to add. Typically:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | `A` | `@` (apex) | `76.76.21.21` | 3600 |
   | `CNAME` | `www` | `cname.vercel-dns.com` | 3600 |

   If your registrar supports `ALIAS`/`ANAME` at the apex, prefer:
   `ALIAS  @  cname.vercel-dns.com` instead of the A record.

   **Use whatever the Vercel dashboard displays** — if it shows a different apex
   IP or a project-specific `…vercel-dns.com` host, use that.

### Propagation

`dig +short api.kobopayments.com` / `dig +short kobopayments.com` to check.
Vercel and Railway both issue TLS certs automatically once the records resolve
(minutes to a couple hours).

---

## 6. Code change in this deploy prep

**`backend/src/index.ts` — CORS is now multi-origin.** Was a single
`FRONTEND_ORIGIN` string; now comma-separated, so one backend serves the real
domain(s) and localhost together. Requests with no `Origin` header (curl,
Railway healthcheck, MoonPay webhooks) are unaffected — CORS only gates
browsers. Disallowed origins get no `Access-Control-Allow-Origin` header (the
browser blocks them); they do not get a 500.

Also: `engines.node = "22.x"` pinned in both `package.json`s; `backend/railway.json`
added. No other files touched. `DEV_SKIP_AUTH` default behaviour, the MoonPay
integration, and all business logic are unchanged.

---

## 7. Smoke test (after deploy)

Against the Railway URL first (temporary `*.up.railway.app`), then
`api.kobopayments.com` once DNS resolves:

```bash
BASE=https://api.kobopayments.com   # or the *.up.railway.app URL

curl -s $BASE/health                              # {"status":"ok"}
curl -s "$BASE/rate?fiatCurrency=EUR"             # { rate: <number>, ... }
curl -s $BASE/market/overview | head -c 300       # CoinGecko-proxied market data

# CORS check from the real frontend origin:
curl -s -D - -o /dev/null -H "Origin: https://kobopayments.com" $BASE/health \
  | grep -i access-control-allow-origin           # should echo the origin
```

Frontend: load `https://kobopayments.com`, confirm it's the real login screen
(not the amber dev-bypass banner), and that the network tab shows calls to
`https://api.kobopayments.com`.

---

## 8. Known-good demo account (devnet)

Do this once the backend is live and the pooled wallet is funded (§4).

1. **Default recipient must be a real row.** `NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID`
   / `_WALLET` (§3) must point at a real `role: "recipient"` row in the
   **deployed** Supabase project. Create it if it isn't there:
   ```
   curl -s -X POST $BASE/users -H 'Content-Type: application/json' \
     -d '{"name":"Adaeze Okonkwo","role":"recipient","country":"NG","wallet_address":"<a real devnet address>"}'
   ```
   In real mode the app only pre-seeds this one recipient (the other three
   fixtures are mock-only); add more live via "Add recipient".

2. **Create the demo sender through the real flow** — sign up in the UI
   (`https://kobopayments.com`, real email + password), then set the PIN.
   Note the `users.id` (Supabase dashboard → `users`, or the signup response).

3. **Seed its balance** with the dev/demo utility (internal ledger only — no
   funding request, no provider settlement, no Solana tx; uses the same atomic
   `creditBalance()` the real webhook uses):
   ```
   cd backend
   # env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SOLANA_RPC_URL (devnet)
   npx tsx scripts/seed-demo-balance.ts <demo_sender_users.id> 500
   ```
   Refuses to run if `SOLANA_RPC_URL` looks like mainnet. Prints the
   before/after balance and the affected user.

4. **Verify the happy path once, for real:** log in → PIN → send a small
   amount to the default recipient → confirm the recipient balance / Activity
   updates and record the `solana_tx_signature` (from `GET /transfers/:id` or
   `explorer.solana.com/?cluster=devnet`).

---

## 9. Launch access mode (pre-launch waitlist gate)

Kobo ships in **waitlist mode**: the public reaches only `/waitlist`. `/`,
`/landing`, the app and every other product route redirect there — enforced
server-side in `frontend/proxy.ts` (Next 16 Proxy), so typing the URL is gated
the same as clicking a link. Developer accounts (DB `users.access_role` =
`developer` / `admin`) pass through via a short-lived HMAC-signed access grant.

### Environment variables

| Where | Variable | Value | Notes |
|---|---|---|---|
| **Vercel** (frontend) | `NEXT_PUBLIC_KOBO_ACCESS_MODE` | `waitlist` | Build-time. Drives `proxy.ts` + `AuthGate` + `ROOT_REDIRECT_TARGET`. Flip to `live` to launch — Vercel redeploys automatically. |
| **Vercel** (frontend) | `KOBO_ACCESS_GRANT_SECRET` | *(32+ random bytes, secret)* | **Not** `NEXT_PUBLIC_`. Server-side only (`proxy.ts` verifies grants). Must **exactly match** Railway's value. `openssl rand -base64 32`. |
| **Railway** (backend) | `KOBO_ACCESS_MODE` | `waitlist` | Runtime. Only gates `POST /auth/signup` (403 in waitlist mode). Flip to `live` to reopen public signup. |
| **Railway** (backend) | `KOBO_ACCESS_GRANT_SECRET` | *(same value as Vercel)* | The API signs grants with this in `GET /auth/access`. |

If `KOBO_ACCESS_GRANT_SECRET` is unset or the two copies differ, **no developer
can pass the gate** (fail closed) — `/waitlist` still works for everyone.

### One-time production migrations (apply via `backend/scripts/run-migration.ts`)

```
cd backend
npx tsx scripts/run-migration.ts supabase/migrations/20260906000000_add_user_access_role.sql
npx tsx scripts/run-migration.ts supabase/migrations/20260906000100_add_waitlist_test_signups.sql
```

### One-time production data operations (dry-run first, then `--apply`)

```
npx tsx scripts/grant-access-role.ts            # then --apply : sets access_role='developer'
                                                #   for elueisaac14@gmail.com + shinaanafi10@gmail.com
npx tsx scripts/cleanup-dev-waitlist-signup.ts  # then --apply : removes the dev test signup #1,
                                                #   resets waitlist_counter to 1 (pre-launch only)
```

### Launch checklist

1. `NEXT_PUBLIC_KOBO_ACCESS_MODE=live` on Vercel → redeploys.
2. `KOBO_ACCESS_MODE=live` on Railway → redeploys.
3. `/landing` is now the public entry point; `/`, `/waitlist`, `/app` unchanged
   and still present. No page is deleted or renamed.

---

## Not in scope here / follow-ups

- Backend wallet keypair persistence (§4) — needed before money-movement works deployed.
- MoonPay: still sandbox keys; `MOONPAY_CRYPTO_CURRENCY_CODE=pyusd_sol`. Live keys + `usdc_sol` is a separate step once MoonPay approves the integration.
- MoonPay webhook URL: once the backend is live, register
  `https://api.kobopayments.com/webhooks/moonpay` in the MoonPay dashboard.
- Supabase Auth (GoTrue) degradation — unrelated to deploy; the timeout fix keeps it graceful.
- `kobo/` directory at repo root is untracked local scratch — not in the repo, doesn't affect deploys, safe to delete locally.
