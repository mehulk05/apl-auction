'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/**
 * JSON store with crash-safe writes.
 *
 * Write path:  auction.tmp.json -> fsync -> re-read & JSON.parse (validate) -> rename over auction.json
 * A rename on the same volume is atomic, so a crash mid-save can never leave a
 * half-written auction.json behind.
 */
class Repository {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'auction.json');
    this.tmpFile = path.join(dataDir, 'auction.tmp.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.saveQueue = Promise.resolve();
    this.saveCount = 0;
  }

  async ensureDirs() {
    await fsp.mkdir(this.dataDir, { recursive: true });
    await fsp.mkdir(this.backupDir, { recursive: true });
  }

  exists() {
    return fs.existsSync(this.file);
  }

  async load() {
    await this.ensureDirs();
    if (!this.exists()) return null;
    const raw = await fsp.readFile(this.file, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (err) {
      // Corrupt primary file -> try the newest backup instead of dying.
      const backups = await this.listBackups();
      for (let i = backups.length - 1; i >= 0; i--) {
        try {
          const text = await fsp.readFile(path.join(this.backupDir, backups[i].file), 'utf8');
          const data = JSON.parse(text);
          console.warn('[repository] auction.json was corrupt; recovered from', backups[i].file);
          return data;
        } catch (_) { /* keep looking */ }
      }
      throw new Error('auction.json is corrupt and no valid backup was found: ' + err.message);
    }
  }

  /** Serialised, atomic save. */
  save(data) {
    const run = this.saveQueue.then(() => this._writeAtomic(data));
    this.saveQueue = run.catch(() => {});
    return run;
  }

  async _writeAtomic(data) {
    await this.ensureDirs();
    const text = JSON.stringify(data, null, 2);

    const handle = await fsp.open(this.tmpFile, 'w');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    // Validate what actually landed on disk before it replaces the good file.
    const verify = await fsp.readFile(this.tmpFile, 'utf8');
    JSON.parse(verify);

    await fsp.rename(this.tmpFile, this.file);
    this.saveCount++;
    return this.file;
  }

  async listBackups() {
    await this.ensureDirs();
    const files = await fsp.readdir(this.backupDir);
    const out = [];
    for (const f of files) {
      if (!/^auction-backup-\d+.*\.json$/.test(f)) continue;
      const st = await fsp.stat(path.join(this.backupDir, f));
      out.push({ file: f, size: st.size, createdAt: st.mtime.toISOString() });
    }
    out.sort((a, b) => a.file.localeCompare(b.file));
    return out;
  }

  /** Snapshot the current state into backups/auction-backup-NNN-<label>.json */
  async backup(data, label = 'manual') {
    await this.ensureDirs();
    const existing = await this.listBackups();
    let next = 1;
    if (existing.length) {
      const nums = existing.map((b) => parseInt(b.file.replace(/^auction-backup-/, ''), 10) || 0);
      next = Math.max(...nums) + 1;
    }
    const safe = String(label).replace(/[^a-z0-9-]+/gi, '-').toLowerCase().slice(0, 40);
    const name = `auction-backup-${String(next).padStart(3, '0')}-${safe}.json`;
    const target = path.join(this.backupDir, name);
    await fsp.writeFile(target, JSON.stringify(data, null, 2), 'utf8');
    await this._pruneBackups(120);
    return name;
  }

  async _pruneBackups(keep) {
    const all = await this.listBackups();
    if (all.length <= keep) return;
    const doomed = all.slice(0, all.length - keep);
    for (const b of doomed) {
      await fsp.unlink(path.join(this.backupDir, b.file)).catch(() => {});
    }
  }
}

module.exports = { Repository };
