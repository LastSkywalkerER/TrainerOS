import { db } from '../db/database';
import { calculateSessionStatus } from '../utils/calculations';

export class RecalculationService {
  async recalculateClient(clientId: string): Promise<void> {
    // Get all sessions for the client
    const sessions = await db.calendarSessions
      .where('client_id')
      .equals(clientId)
      .toArray();

    // Recalculate each session
    for (const session of sessions) {
      await this.recalculateSession(session.id);
    }

    // Force analytics refresh (they are calculated on-demand, so this is just for cache invalidation if needed)
  }

  async recalculateSession(sessionId: string): Promise<void> {
    // Status is calculated on-demand, so we don't need to store it
    // But we can trigger any side effects here if needed
    await calculateSessionStatus(sessionId);
  }

  async recalculateAll(): Promise<void> {
    const clients = await db.clients.toArray();
    for (const client of clients) {
      await this.recalculateClient(client.id);
    }
  }
}

export const recalculateService = new RecalculationService();
