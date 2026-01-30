import { db } from '../db/database';
import { Client, CreateClientDto, ClientStatus } from '../db/types';
import { generateId } from '../utils/uuid';

export class ClientService {
  async create(clientData: CreateClientDto): Promise<Client> {
    const now = new Date();
    const client: Client = {
      id: generateId(),
      full_name: clientData.full_name,
      phone: clientData.phone,
      telegram: clientData.telegram,
      notes: clientData.notes,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    await db.clients.add(client);
    return client;
  }

  async update(id: string, updates: Partial<Client>): Promise<Client> {
    const client = await db.clients.get(id);
    if (!client) {
      throw new Error(`Client with id ${id} not found`);
    }

    const updated: Client = {
      ...client,
      ...updates,
      updated_at: new Date(),
    };

    await db.clients.update(id, updated);
    return updated;
  }

  async archive(id: string, archiveDate: Date): Promise<void> {
    await this.update(id, { 
      status: 'archived',
      archive_date: archiveDate,
    });
  }

  async pause(id: string, pauseFrom: Date, pauseTo: Date): Promise<void> {
    await this.update(id, { 
      status: 'paused',
      pause_from: pauseFrom,
      pause_to: pauseTo,
    });
  }

  async resume(id: string): Promise<void> {
    await this.update(id, { 
      status: 'active',
      pause_from: undefined,
      pause_to: undefined,
    });
  }

  async getAll(filters?: { status?: ClientStatus }): Promise<Client[]> {
    if (filters?.status) {
      return db.clients.where('status').equals(filters.status).toArray();
    }
    return db.clients.toArray();
  }

  async getById(id: string): Promise<Client | null> {
    const client = await db.clients.get(id);
    return client ?? null;
  }

  async delete(id: string): Promise<void> {
    // Soft delete - archive instead
    await this.archive(id, new Date());
  }

  async hardDelete(id: string): Promise<void> {
    // Hard delete - remove all related data
    await db.transaction('rw', [db.clients, db.scheduleTemplates, db.calendarSessions, db.packages, db.payments, db.paymentAllocations], async () => {
      // Get all related sessions
      const sessions = await db.calendarSessions.where('client_id').equals(id).toArray();
      const sessionIds = sessions.map(s => s.id);

      // Delete allocations for these sessions
      await db.paymentAllocations.where('session_id').anyOf(sessionIds).delete();

      // Delete payments and their allocations
      const payments = await db.payments.where('client_id').equals(id).toArray();
      const paymentIds = payments.map(p => p.id);
      await db.paymentAllocations.where('payment_id').anyOf(paymentIds).delete();

      // Delete all related entities
      await db.calendarSessions.where('client_id').equals(id).delete();
      await db.scheduleTemplates.where('client_id').equals(id).delete();
      await db.packages.where('client_id').equals(id).delete();
      await db.payments.where('client_id').equals(id).delete();
      await db.clients.delete(id);
    });
  }
}

export const clientService = new ClientService();
