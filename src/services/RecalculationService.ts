import { getDb } from '../db/rxdb';
import { calculateSessionStatus } from '../utils/calculations';
import { toClientEntity } from '../db/dateHelpers';

export class RecalculationService {
  async recalculateClient(clientId: string): Promise<void> {
    const db = await getDb();
    const sessionDocs = await db.calendar_sessions.find({ selector: { client_id: clientId } }).exec();

    for (const doc of sessionDocs) {
      await this.recalculateSession(doc.id);
    }
  }

  async recalculateSession(sessionId: string): Promise<void> {
    await calculateSessionStatus(sessionId);
  }

  async recalculateAll(): Promise<void> {
    const db = await getDb();
    const clientDocs = await db.clients.find().exec();
    const clients = clientDocs.map((d: any) => toClientEntity(d.toJSON()));
    for (const client of clients) {
      await this.recalculateClient(client.id);
    }
  }
}

export const recalculateService = new RecalculationService();
