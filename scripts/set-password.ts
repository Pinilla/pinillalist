// Sets the household password. Every phone has to log in again afterwards.
// Usage: npm run set-password   (asks for the password without echoing it)
import { mkdirSync } from "node:fs";
import { setPassword } from "../src/server/auth.ts";
import { loadConfig } from "../src/server/config.ts";
import { migrateDb, openDb } from "../src/server/db/index.ts";

async function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8").split("\n")[0]!.trim();
  }
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    stdin.on("data", (data: Buffer) => {
      for (const ch of data.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          reject(new Error("Cancelled"));
          return;
        }
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    });
  });
}

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(config.dbFile);
migrateDb(db);
const password = await readHidden("New household password: ");
if (process.stdin.isTTY) {
  const again = await readHidden("Type it again: ");
  if (again !== password) {
    console.error("The two passwords don't match. Nothing changed.");
    process.exit(1);
  }
}
try {
  setPassword(db, password);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
console.log("Password set. Phones will need to log in again.");
