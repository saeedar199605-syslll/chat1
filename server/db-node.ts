import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setDb, initDatabase } from './db';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new DatabaseSync(path.join(DATA_DIR, 'workstream.db'));
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA synchronous = NORMAL;'); // safe with WAL, far fewer fsyncs
sqlite.exec('PRAGMA busy_timeout = 5000;');

setDb({
  prepare: (sql) => sqlite.prepare(sql) as never,
  exec: (sql) => sqlite.exec(sql),
  transaction: (fn) => {
    sqlite.exec('BEGIN');
    try {
      const out = fn();
      sqlite.exec('COMMIT');
      return out;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  },
});

initDatabase();
