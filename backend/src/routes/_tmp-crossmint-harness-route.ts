import { Router } from "express";

/**
 * ⚠️⚠️⚠️ TEMPORARY, DEV-ONLY — DELETE AFTER THE REAL-DOMAIN CHECKOUT TEST ⚠️⚠️⚠️
 *
 * Serves the throwaway Crossmint embedded-checkout harness from a real
 * registered HTTPS origin (api.kobopayments.com) rather than localhost, since
 * Apple Pay and some origin-dependent SDK behavior are disabled on an
 * unregistered origin. No auth (deliberately — this is a one-off manual
 * diagnostic click-through, not a real user-facing page). No secrets are
 * logged by this route; the client-side key embedded below is a Crossmint
 * CLIENT-SIDE key (ck_staging_...), designed to be exposed in browser code,
 * not a server secret.
 *
 * Mounted at GET /_tmp-crossmint-harness in index.ts. Remove both this file
 * and that mount line once the test is done.
 */
export const tmpCrossmintHarnessRouter = Router();

// Read at request time, not baked into the committed source — none of these
// values (a real client-side key + a live order's client secret) belong in
// git history, even temporarily. Set via `railway variable set` and unset
// immediately after the test.
function getConfig() {
  const CLIENT_API_KEY = process.env.CROSSMINT_TMP_HARNESS_CLIENT_KEY;
  const ORDER_ID = process.env.CROSSMINT_TMP_HARNESS_ORDER_ID;
  const CLIENT_SECRET = process.env.CROSSMINT_TMP_HARNESS_CLIENT_SECRET;
  const RECEIPT_EMAIL = process.env.CROSSMINT_TMP_HARNESS_RECEIPT_EMAIL;
  const FUNDING_REQUEST_ID = process.env.CROSSMINT_TMP_HARNESS_FUNDING_REQUEST_ID;
  if (!CLIENT_API_KEY || !ORDER_ID || !CLIENT_SECRET || !RECEIPT_EMAIL || !FUNDING_REQUEST_ID) {
    return null;
  }
  return { CLIENT_API_KEY, ORDER_ID, CLIENT_SECRET, RECEIPT_EMAIL, FUNDING_REQUEST_ID };
}

function renderHtml(cfg: NonNullable<ReturnType<typeof getConfig>>): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Crossmint Checkout — real-domain diagnostic (throwaway)</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f4f4f6; margin: 0; padding: 40px 16px; color: #1a1a1a; }
  .wrap { max-width: 480px; margin: 0 auto; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #555; background: #fff; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; line-height: 1.6; }
  .meta code { background: #eee; padding: 1px 4px; border-radius: 4px; }
  .hint { font-size: 12px; color: #555; background: #fff8e1; border: 1px solid #f0d878; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; line-height: 1.6; }
  #checkout-mount { background: #fff; border-radius: 12px; padding: 8px; min-height: 200px; }
  #status { font-size: 12px; color: #a00; margin-top: 8px; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Crossmint Checkout — real-domain diagnostic</h1>
    <div class="meta">
      funding_request: <code>${cfg.FUNDING_REQUEST_ID}</code><br />
      orderId: <code>${cfg.ORDER_ID}</code><br />
      receiptEmail: <code>${cfg.RECEIPT_EMAIL}</code> (throwaway)<br />
      served from: <code>api.kobopayments.com</code> (registered HTTPS origin)
    </div>
    <div class="hint">
      <strong>Attempt A (try first):</strong> 4242 4242 4242 4242, US billing, ZIP 10001, any future expiry/CVC.<br />
      <strong>Attempt B (only if A fails):</strong> 5555 5555 5555 4444, US billing.<br />
      <strong>Stop after B regardless of outcome.</strong>
    </div>
    <div id="checkout-mount"></div>
    <div id="status"></div>
  </div>

  <script type="module">
    import React from "https://esm.sh/react@18.3.1";
    import ReactDOM from "https://esm.sh/react-dom@18.3.1/client";
    import { CrossmintProvider, CrossmintEmbeddedCheckout } from "https://esm.sh/@crossmint/client-sdk-react-ui?deps=react@18.3.1,react-dom@18.3.1";

    const CLIENT_API_KEY = "${cfg.CLIENT_API_KEY}";
    const ORDER_ID = "${cfg.ORDER_ID}";
    const CLIENT_SECRET = "${cfg.CLIENT_SECRET}";

    function App() {
      return React.createElement(
        CrossmintProvider,
        { apiKey: CLIENT_API_KEY },
        React.createElement(CrossmintEmbeddedCheckout, {
          orderId: ORDER_ID,
          clientSecret: CLIENT_SECRET,
          payment: {
            receiptEmail: "${cfg.RECEIPT_EMAIL}",
            crypto: { enabled: false },
            fiat: { enabled: true },
            defaultMethod: "fiat",
          },
        })
      );
    }

    window.addEventListener("error", (e) => {
      document.getElementById("status").textContent = "JS error: " + e.message;
    });

    try {
      const root = ReactDOM.createRoot(document.getElementById("checkout-mount"));
      root.render(React.createElement(App));
    } catch (err) {
      document.getElementById("status").textContent = "Render error: " + err.message;
    }
  </script>
</body>
</html>`;
}

tmpCrossmintHarnessRouter.get("/", (_req, res) => {
  const cfg = getConfig();
  if (!cfg) {
    return res.status(503).send("Harness not configured yet (missing CROSSMINT_TMP_HARNESS_* env vars).");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderHtml(cfg));
});
