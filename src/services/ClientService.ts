import { getDb } from '../db/rxdb';
import { Client, CreateClientDto, ClientStatus } from '../db/types';
import { generateId } from '../utils/uuid';
import {
  toDbDate,
  toClientEntity,
  clientToDb,
  stripUndefined,
} from '../db/dateHelpers';

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
      start_date: clientData.start_date || now,
      created_at: now,
      updated_at: now,
    };

    const db = await getDb();
    await db.clients.insert(stripUndefined(clientToDb(client)));
    return client;
  }

  async update(id: string, updates: Partial<Client>): Promise<Client> {
    const db = await getDb();
    const doc = await db.clients.findOne(id).exec();
    if (!doc) {
      throw new Error(`Client with id ${id} not found`);
    }

    const current = toClientEntity(doc.toJSON());
    const updated: Client = {
      ...current,
      ...updates,
      updated_at: new Date(),
    };

    await doc.patch(stripUndefined(clientToDb(updated)));
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
    const db = await getDb();
    const doc = await db.clients.findOne(id).exec();
    if (!doc) {
      throw new Error(`Client with id ${id} not found`);
    }

    const current = toClientEntity(doc.toJSON());
    const updated: Client = {
      ...current,
      status: 'active',
      pause_from: undefined,
      pause_to: undefined,
      archive_date: undefined,
      updated_at: new Date(),
    };

    // RxDB doesn't support undefined fields in patch, so we use modify
    await doc.modify((docData: any) => {
      docData.status = 'active';
      docData.updated_at = toDbDate(new Date());
      delete docData.pause_from;
      delete docData.pause_to;
      delete docData.archive_date;
      return docData;
    });

    // Return for consistency even though we don't use the return value
    void updated;
  }

  async getAll(filters?: { status?: ClientStatus }): Promise<Client[]> {
    const db = await getDb();
    let docs;
    if (filters?.status) {
      docs = await db.clients.find({ selector: { status: filters.status } }).exec();
    } else {
      docs = await db.clients.find().exec();
    }
    return docs.map((d: any) => toClientEntity(d.toJSON()));
  }

  async getById(id: string): Promise<Client | null> {
    const db = await getDb();
    const doc = await db.clients.findOne(id).exec();
    return doc ? toClientEntity(doc.toJSON()) : null;
  }

  async delete(id: string): Promise<void> {
    // Soft delete - archive instead
    await this.archive(id, new Date());
  }

  async hardDelete(id: string): Promise<void> {
    const db = await getDb();

    // Get all related sessions
    const sessions = await db.calendar_sessions.find({ selector: { client_id: id } }).exec();
    const sessionIds = sessions.map((s: any) => s.id);

    // Delete allocations for these sessions
    if (sessionIds.length > 0) {
      const allAllocations = await db.payment_allocations.find({
        selector: { session_id: { $in: sessionIds } },
      }).exec();
      await Promise.all(allAllocations.map((a: any) => a.remove()));
    }

    // Delete allocations for payments
    const payments = await db.payments.find({ selector: { client_id: id } }).exec();
    const paymentIds = payments.map((p: any) => p.id);
    if (paymentIds.length > 0) {
      const paymentAllocations = await db.payment_allocations.find({
        selector: { payment_id: { $in: paymentIds } },
      }).exec();
      await Promise.all(paymentAllocations.map((a: any) => a.remove()));
    }

    // Delete all related entities
    await Promise.all(sessions.map((s: any) => s.remove()));
    const templates = await db.schedule_templates.find({ selector: { client_id: id } }).exec();
    await Promise.all(templates.map((t: any) => t.remove()));
    const packages = await db.packages.find({ selector: { client_id: id } }).exec();
    await Promise.all(packages.map((p: any) => p.remove()));
    await Promise.all(payments.map((p: any) => p.remove()));

    // Delete client
    const clientDoc = await db.clients.findOne(id).exec();
    if (clientDoc) {
      await clientDoc.remove();
    }
  }
}

export const clientService = new ClientService();
