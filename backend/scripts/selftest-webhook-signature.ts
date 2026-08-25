import "dotenv/config";
import jwt from "jsonwebtoken";
import { getAccessToken } from "../src/lib/transak";

// Self-test only: proves our jwt-verification code correctly accepts a
// payload signed with our REAL Transak access token. Does NOT prove Transak
// actually delivers webhooks to us — that requires a registered, publicly
// reachable webhook URL, which this local dev server doesn't have.

async function main() {
  const accessToken = await getAccessToken();

  const transferId = process.argv[2];
  if (!transferId) throw new Error("Usage: tsx scripts/selftest-webhook-signature.ts <transfer_id>");

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
  console.log(JSON.stringify({ data: signed }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
