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
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

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
