import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { nowIso } from './time.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const databasePath = isAbsolute(config.sqlitePath) ? config.sqlitePath : resolve(projectRoot, config.sqlitePath);
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

const migrationsDirectory = resolve(projectRoot, 'db/migrations');
export function applyMigrations(database: Database.Database, directory = migrationsDirectory) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const migrationFiles = readdirSync(directory)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));
  const applied = database.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const record = database.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  for (const name of migrationFiles) {
    if (applied.get(name)) continue;
    const sql = readFileSync(resolve(directory, name), 'utf8');
    database.transaction(() => {
      database.exec(sql);
      record.run(name, nowIso());
    })();
  }
}

applyMigrations(db);
export { nowIso } from './time.js';
export const sqliteInfo = {
  path: databasePath,
  journalMode: String(db.pragma('journal_mode', { simple: true })),
  foreignKeys: Number(db.pragma('foreign_keys', { simple: true })) === 1,
};
