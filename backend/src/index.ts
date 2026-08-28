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

// Hosting platforms (Render/Railway/Fly/Heroku) and CDNs put the real client
// IP in X-Forwarded-For; `trust proxy` makes req.ip resolve to it (used for
// MoonPay's allowedIpAddress requirement — see routes/funding.ts). Env-driven
// so it can be tightened per host: "1" = one proxy hop (typical PaaS, the
// default), a number for N hops, a CIDR list, or "false" to trust nothing.
app.set("trust proxy", process.env.TRUST_PROXY ?? 1);

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

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
