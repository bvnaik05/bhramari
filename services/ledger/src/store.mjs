import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export class RelayStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY, root TEXT NOT NULL, event_count INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', transaction_hash TEXT, raw_transaction TEXT,
        receipt TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at TEXT NOT NULL
      );`);
  }

  enqueue(checkpoint) {
    const existing = this.get(checkpoint.id);
    if (existing && (existing.root !== checkpoint.root || existing.event_count !== checkpoint.event_count)) {
      throw new Error('Checkpoint ID reused with different contents');
    }
    this.db.prepare('INSERT OR IGNORE INTO checkpoints (id,root,event_count,updated_at) VALUES (?,?,?,?)')
      .run(checkpoint.id, checkpoint.root, checkpoint.event_count, new Date().toISOString());
    return this.get(checkpoint.id);
  }

  get(id) { return this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id); }
  pending() { return this.db.prepare("SELECT * FROM checkpoints WHERE state != 'delivered' ORDER BY updated_at").all(); }

  signed(id, rawTransaction, transactionHash) {
    this.db.prepare("UPDATE checkpoints SET state='signed',raw_transaction=?,transaction_hash=?,updated_at=? WHERE id=?")
      .run(rawTransaction, transactionHash, new Date().toISOString(), id);
  }

  confirmed(id, receipt) {
    this.db.prepare("UPDATE checkpoints SET state='confirmed',receipt=?,last_error=NULL,updated_at=? WHERE id=?")
      .run(JSON.stringify(receipt), new Date().toISOString(), id);
  }

  delivered(id) {
    this.db.prepare("UPDATE checkpoints SET state='delivered',raw_transaction=NULL,last_error=NULL,updated_at=? WHERE id=?")
      .run(new Date().toISOString(), id);
  }

  failed(id, error) {
    this.db.prepare('UPDATE checkpoints SET attempts=attempts+1,last_error=?,updated_at=? WHERE id=?')
      .run(String(error).slice(0, 500), new Date().toISOString(), id);
  }

  close() { this.db.close(); }
}
