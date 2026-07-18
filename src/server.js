import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import app from "./app.js";

const start = async () => {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`CMS backend running at http://localhost:${env.port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
