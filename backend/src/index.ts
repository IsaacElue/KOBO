import "dotenv/config";
import cors from "cors";
import express from "express";
import { transfersRouter } from "./routes/transfers";
import { webhooksRouter } from "./routes/webhooks";
import { balancesRouter } from "./routes/balances";
import { usersRouter } from "./routes/users";

const app = express();
const port = process.env.PORT || 4000;
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/transfers", transfersRouter);
app.use("/webhooks", webhooksRouter);
app.use("/balances", balancesRouter);
app.use("/users", usersRouter);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
