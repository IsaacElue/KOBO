import "dotenv/config";
import cors from "cors";
import express from "express";
import { transfersRouter } from "./routes/transfers";
import { webhooksRouter } from "./routes/webhooks";
import { balancesRouter } from "./routes/balances";
import { usersRouter } from "./routes/users";
import { rateRouter } from "./routes/rate";
import { fundingRouter } from "./routes/funding";
import { authRouter } from "./routes/auth";
import { marketRouter } from "./routes/market";
// ⚠️ TEMPORARY — delete this import + the mount line below after the
// Crossmint real-domain checkout test (see routes/_tmp-crossmint-harness-route.ts).
import { tmpCrossmintHarnessRouter } from "./routes/_tmp-crossmint-harness-route";

const app = express();
const port = process.env.PORT || 4000;

// Allowed browser origins for CORS. Comma-separated so one deploy can serve the
// real domain(s) and localhost at once, e.g.
//   FRONTEND_ORIGIN="https://kobopayments.com,https://www.kobopayments.com,http://localhost:3000"
// Unset => localhost dev only. Requests with no Origin header (curl, health
// checks, server-to-server, webhooks) are unaffected — CORS only gates browsers.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// `trust proxy` makes req.ip resolve to the real client IP from
// X-Forwarded-For (used for MoonPay's allowedIpAddress — see routes/funding.ts).
// Default trusts by network range, not hop count: loopback + RFC1918 private +
// Railway's 100.64.0.0/10 CGNAT are treated as proxy infrastructure, so req.ip
// becomes the first *public* address in the chain — the real client. A fixed
// hop count ("1") got this wrong on Railway: it landed on the internal
// 100.64.x.x proxy address. Override with TRUST_PROXY (a number, CIDR list, or
// "false") if a host needs something different.
app.set(
  "trust proxy",
  process.env.TRUST_PROXY ?? "loopback, uniquelocal, 100.64.0.0/10"
);

app.use(
  cors({
    origin(origin, cb) {
      // No Origin (non-browser client) or an allow-listed one → OK.
      // Anything else → no CORS headers, so the browser blocks it (not a 500).
      cb(null, !origin || allowedOrigins.includes(origin));
    },
  })
);
// Keep the raw body around for webhook signature verification (MoonPay's
// Moonpay-Signature-V2 is an HMAC over the exact bytes, pre-JSON-parse).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/transfers", transfersRouter);
app.use("/webhooks", webhooksRouter);
app.use("/balances", balancesRouter);
app.use("/users", usersRouter);
app.use("/rate", rateRouter);
app.use("/funding", fundingRouter);
app.use("/market", marketRouter);
// ⚠️ TEMPORARY — remove after the Crossmint real-domain checkout test.
app.use("/_tmp-crossmint-harness", tmpCrossmintHarnessRouter);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
