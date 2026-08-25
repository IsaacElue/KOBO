import "dotenv/config";
import express from "express";
import { transfersRouter } from "./routes/transfers";
import { webhooksRouter } from "./routes/webhooks";
import { balancesRouter } from "./routes/balances";

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/transfers", transfersRouter);
app.use("/webhooks", webhooksRouter);
app.use("/balances", balancesRouter);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
