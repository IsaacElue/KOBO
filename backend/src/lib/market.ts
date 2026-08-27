/**
 * Crypto market data for the Activity page, proxied from CoinGecko's free
 * public API. Keyless: CoinGecko's shared/keyless tier is tight (~5-8 req/min
 * before a punitive 429), so this proxies through the backend with an
 * in-memory TTL cache — one upstream call per `CACHE_TTL_MS` regardless of how
 * many clients hit `GET /market/overview`, which keeps us to <1 call/min, well
 * under the limit. Same "one cached upstream fetch serves every client" idea
 * as the Transak access-token cache in `transak.ts`.
 *
 * No Demo API key needed and none configured — the backend cache alone brings
 * usage far below the keyless ceiling. Revisit only if a real deployment sees
 * many independent backend instances hitting CoinGecko in parallel.
 */

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/markets" +
  "?ids=solana,usd-coin&vs_currency=eur&price_change_percentage=24h,7d&sparkline=true";

// Long enough to stay well under CoinGecko's keyless rate limit; short enough
// that the ticker still feels live. Market prices don't move meaningfully in
// 90s at the granularity this page shows.
const CACHE_TTL_MS = 90_000;
// If a refresh fails (429 / upstream down) we keep serving the last good
// payload for up to this long, flagged `stale: true`, before giving up.
const STALE_GRACE_MS = 30 * 60_000;

export interface CoinSummary {
  price_eur: number;
  change_24h: number | null;
  change_7d: number | null;
  /** 7-day hourly price points (CoinGecko's free sparkline; USD-denominated regardless of vs_currency — treat as trend shape, not axis values). */
  sparkline_7d: number[];
}

export interface MarketOverview {
  sol: CoinSummary;
  usdc: CoinSummary;
  updated_at: string;
  /** true when the upstream refresh failed and this is the last-known-good payload. */
  stale: boolean;
}

interface CacheEntry {
  data: MarketOverview;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<MarketOverview> | null = null;

interface CoinGeckoRow {
  id: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price: number[] };
}

function toCoinSummary(row: CoinGeckoRow): CoinSummary {
  return {
    price_eur: row.current_price,
    change_24h: row.price_change_percentage_24h_in_currency ?? row.price_change_percentage_24h ?? null,
    change_7d: row.price_change_percentage_7d_in_currency ?? null,
    sparkline_7d: row.sparkline_in_7d?.price ?? [],
  };
}

async function fetchFromCoinGecko(): Promise<MarketOverview> {
  const res = await fetch(COINGECKO_URL, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CoinGecko markets ${res.status}${res.status === 429 ? " (rate limited)" : ""}`);
  }
  const rows = (await res.json()) as CoinGeckoRow[];
  const sol = rows.find((r) => r.id === "solana");
  const usdc = rows.find((r) => r.id === "usd-coin");
  if (!sol || !usdc) {
    throw new Error("CoinGecko markets response missing solana/usd-coin");
  }
  return {
    sol: toCoinSummary(sol),
    usdc: toCoinSummary(usdc),
    updated_at: new Date().toISOString(),
    stale: false,
  };
}

/**
 * Returns the market overview, served from cache when fresh. On a cache miss
 * it fetches upstream (de-duping concurrent misses into one call). If that
 * fetch fails but we have a not-too-old cached payload, that payload is
 * returned with `stale: true` rather than erroring — the frontend then shows
 * a "prices may be delayed" hint instead of a broken card. Only throws when
 * there is no usable cached data at all.
 */
export async function getMarketOverview(): Promise<MarketOverview> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  if (!inFlight) {
    inFlight = (async () => {
      try {
        const fresh = await fetchFromCoinGecko();
        cache = { data: fresh, fetchedAt: Date.now() };
        return fresh;
      } catch (err) {
        if (cache && Date.now() - cache.fetchedAt < STALE_GRACE_MS) {
          console.warn(`Market refresh failed (${(err as Error).message}); serving stale cache.`);
          return { ...cache.data, stale: true };
        }
        throw err;
      } finally {
        inFlight = null;
      }
    })();
  }

  return inFlight;
}
