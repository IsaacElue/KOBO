import "dotenv/config";
import express from "express";
import jwt from "jsonwebtoken";
import { getAccessToken } from "../src/lib/transak";
import { webhooksRouter } from "../src/routes/webhooks";

// Self-test only, single process (avoids colliding with the main dev
// server's cached Transak access token — Transak invalidates the previous
// token whenever refresh-token is called again). Proves our verification +
// downstream pipeline code is correct against a genuinely-signed payload.
// Does NOT prove Transak itself delivers webhooks to us.

async function main() {
  const transferId = process.argv[2];
  if (!transferId) throw new Error("Usage: tsx scripts/selftest-webhook-e2e.ts <transfer_id>");

  const accessToken = await getAccessToken();

  const payload = {
    eventID: "ORDER_COMPLETED",
    webhookData: {
      id: "selftest-order-id-001",
      status: "COMPLETED",
      walletAddress: "78rrQoUQWNPgVCXWctRfQpWk73atkcrWdP3Bdxccgu4n",
      transactionHash: "SELFTEST_PLACEHOLDER",
      cryptoAmount: 27,
      cryptoCurrency: "USDC",
      network: "solana",
      partnerOrderId: transferId,
    },
    createdAt: new Date().toISOString(),
  };
  const signed = jwt.sign(payload, accessToken);

  const app = express();
  app.use(express.json());
  app.use("/webhooks", webhooksRouter);
  const server = app.listen(4099, async () => {
    const res = await fetch("http://localhost:4099/webhooks/onramp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: signed }),
    });
    console.log("HTTP", res.status);
    console.log(JSON.stringify(await res.json(), null, 2));
    server.close();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
