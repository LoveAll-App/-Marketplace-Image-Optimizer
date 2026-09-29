import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createApp } from "./app";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4780);
const host = "127.0.0.1"; // never exposed beyond this machine

sharp.cache({ files: 0, memory: 128 });
const { app, store } = createApp({ webDist: path.resolve(here, "../../web/dist") });

const server = app.listen(port, host, () => {
  console.log(`Marketplace Image Optimizer API  →  http://${host}:${port}`);
  console.log(`Temporary files: ${store.root}  (deleted on exit)`);
});

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  server.close();
  store.dispose();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => { try { store.dispose(); } catch { /* already gone */ } });
