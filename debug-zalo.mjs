import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(process.env.APPDATA ?? "", "Zerun Pro Max", "post_logs.sqlite");

async function main() {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  console.log("=== ZALO SOURCE CHANNELS ===");
  const channels = db.exec(`
    SELECT id, name, external_id, is_source, is_active, account_id 
    FROM platform_channels 
    WHERE platform = 'zalo-personal' AND account_kind = 'source'
  `);
  if (channels.length > 0) {
    console.table(channels[0].values.map(row => {
      const cols = channels[0].columns;
      const obj = {};
      cols.forEach((col, i) => obj[col] = row[i]);
      return obj;
    }));
  }

  console.log("\n=== RECENT ZALO CONTENTS ===");
  const contents = db.exec(`
    SELECT id, code, external_id, source_channel_id, author, created_at 
    FROM content 
    WHERE platform = 'zalo-personal'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  if (contents.length > 0) {
    console.table(contents[0].values.map(row => {
      const cols = contents[0].columns;
      const obj = {};
      cols.forEach((col, i) => obj[col] = row[i]);
      return obj;
    }));
  }

  console.log("\n=== SOURCE ACCOUNTS ===");
  const accounts = db.exec(`
    SELECT id, name, platform, is_active 
    FROM source_accounts 
    WHERE platform = 'zalo-personal'
  `);
  if (accounts.length > 0) {
    console.table(accounts[0].values.map(row => {
      const cols = accounts[0].columns;
      const obj = {};
      cols.forEach((col, i) => obj[col] = row[i]);
      return obj;
    }));
  }

  db.close();
}

main().catch(console.error);
