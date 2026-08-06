import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import app from "./app.js";
import { startCheckoutReminderJob } from "./jobs/checkoutReminder.job.js";

const start = async () => {
  await connectDatabase();
  const checkoutReminderJob = startCheckoutReminderJob();

  const server = app.listen(env.port, () => {
    console.log(`CMS backend running at http://localhost:${env.port}`);
  });

  const shutdown = () => {
    checkoutReminderJob.stop();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

start().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
