'use strict';

const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * In-memory per-filename write queue (mutex).
 *
 * Every writeData call for a given filename is chained onto that filename's
 * promise. This serializes writes to the same file so two concurrent writes
 * cannot interleave and corrupt the JSON on disk. Reads are not queued; the
 * design keeps each mutation (read-modify-write in a controller) short, and the
 * queue guarantees the final write step is atomic per file.
 */
const writeQueues = new Map();

/**
 * Read and parse a JSON file from ./data.
 * Returns [] on ANY failure (missing file, corrupt JSON, permission error) so
 * callers never crash on a fresh or damaged data store.
 *
 * @param {string} filename e.g. "products.json"
 * @returns {Promise<Array|Object>} parsed data, or [] on error
 */
async function readData(filename) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    // Missing file, corrupt JSON, or any read error -> empty collection.
    return [];
  }
}

/**
 * Write pretty-printed JSON (2-space indent) to ./data/<filename>.
 * Serialized per filename through an in-memory queue to guard against
 * concurrent writes corrupting the file.
 *
 * @param {string} filename e.g. "products.json"
 * @param {Array|Object} data
 * @returns {Promise<void>}
 */
async function writeData(filename, data) {
  const filePath = path.join(DATA_DIR, filename);

  // Chain this write onto any pending write for the same filename.
  const previous = writeQueues.get(filename) || Promise.resolve();

  const next = previous
    .catch(() => {}) // isolate: a prior failure must not break this write
    .then(() => fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8'));

  // Store the tail of the chain; clean up when it is the last one.
  writeQueues.set(filename, next);
  next.finally(() => {
    if (writeQueues.get(filename) === next) {
      writeQueues.delete(filename);
    }
  });

  return next;
}

module.exports = { readData, writeData };
