// Database migrations
import { db } from './database';
import { Client } from './types';

export async function runMigrations() {
  // Migration to version 3: Add start_date to clients
  if (db.verno < 3) {
    await migrateToVersion3();
  }
}

async function migrateToVersion3() {
  // Set start_date for existing clients to their created_at date
  const clients = await db.clients.toArray();
  const updates = clients
    .filter((client: Client) => !client.start_date)
    .map((client: Client) => ({
      ...client,
      start_date: client.created_at,
    }));

  await Promise.all(
    updates.map((client) => db.clients.update(client.id, client))
  );
}
