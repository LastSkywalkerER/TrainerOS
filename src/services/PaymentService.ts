import { getDb } from '../db/rxdb';
import { Payment, CreatePaymentDto } from '../db/types';
import { generateId } from '../utils/uuid';
import { allocationService } from './AllocationService';
import { isDateInRange } from '../utils/dateUtils';
import {
  toPaymentEntity,
  toClientEntity,
  toCalendarSessionEntity,
  paymentToDb,
  stripUndefined,
} from '../db/dateHelpers';

export class PaymentService {
  async create(
    clientId: string,
    payment: CreatePaymentDto
  ): Promise<Payment> {
    const now = new Date();
    const paymentEntity: Payment = {
      id: generateId(),
      client_id: clientId,
      paid_at: payment.paid_at,
      amount: payment.amount,
      method: payment.method,
      comment: payment.comment,
      created_at: now,
      updated_at: now,
    };

    const db = await getDb();
    await db.payments.insert(stripUndefined(paymentToDb(paymentEntity)));
    return paymentEntity;
  }

  async update(
    id: string,
    updates: Partial<Payment>
  ): Promise<Payment> {
    const db = await getDb();
    const doc = await db.payments.findOne(id).exec();
    if (!doc) {
      throw new Error(`Payment with id ${id} not found`);
    }

    const payment = toPaymentEntity(doc.toJSON());
    const updated: Payment = {
      ...payment,
      ...updates,
      updated_at: new Date(),
    };

    await doc.patch(stripUndefined(paymentToDb(updated)));
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();

    // Delete all allocations first
    const allocationDocs = await db.payment_allocations.find({
      selector: { payment_id: id },
    }).exec();

    const sessionIds = allocationDocs.map((a: any) => a.toJSON().session_id);

    await Promise.all(allocationDocs.map((a: any) => a.remove()));

    // Delete the payment
    const paymentDoc = await db.payments.findOne(id).exec();
    if (paymentDoc) {
      await paymentDoc.remove();
    }

    // Recalculate affected sessions
    const { recalculateService } = await import('./RecalculationService');
    for (const sessionId of sessionIds) {
      await recalculateService.recalculateSession(sessionId);
    }
  }

  async getAllByClient(clientId: string): Promise<Payment[]> {
    const db = await getDb();
    const docs = await db.payments.find({ selector: { client_id: clientId } }).exec();
    const payments = docs.map((d: any) => toPaymentEntity(d.toJSON()));
    payments.sort((a, b) => a.paid_at.getTime() - b.paid_at.getTime());
    return payments;
  }

  async getAll(): Promise<Payment[]> {
    const db = await getDb();
    const docs = await db.payments.find().exec();
    const payments = docs.map((d: any) => toPaymentEntity(d.toJSON()));
    payments.sort((a, b) => b.paid_at.getTime() - a.paid_at.getTime());
    return payments;
  }

  async autoAllocate(paymentId: string): Promise<void> {
    const db = await getDb();
    const paymentDoc = await db.payments.findOne(paymentId).exec();
    if (!paymentDoc) {
      throw new Error(`Payment with id ${paymentId} not found`);
    }
    const payment = toPaymentEntity(paymentDoc.toJSON());

    // Get client to check pause period
    const clientDoc = await db.clients.findOne(payment.client_id).exec();
    if (!clientDoc) {
      return;
    }
    const client = toClientEntity(clientDoc.toJSON());

    // Get unpaid sessions for the client, ordered by date
    const sessionDocs = await db.calendar_sessions.find({
      selector: {
        client_id: payment.client_id,
        status: { $ne: 'canceled' },
      },
    }).exec();

    const sessions = sessionDocs
      .map((d: any) => toCalendarSessionEntity(d.toJSON()))
      .sort((a, b) => a.date.localeCompare(b.date));

    let remainingAmount = payment.amount;

    for (const session of sessions) {
      if (remainingAmount <= 0) {
        break;
      }

      // Skip sessions in pause period
      if (client.pause_from && client.pause_to) {
        const sessionDate = new Date(session.date);
        if (isDateInRange(sessionDate, client.pause_from, client.pause_to)) {
          continue;
        }
      }

      const allocated = await allocationService.getAllocatedAmount(session.id);
      const { calculateSessionPrice } = await import('../utils/calculations');
      const price = await calculateSessionPrice(session.client_id, session.id);
      const needed = price - allocated;

      if (needed > 0) {
        const toAllocate = Math.min(remainingAmount, needed);
        await allocationService.allocate(paymentId, session.id, toAllocate);
        remainingAmount -= toAllocate;
      }
    }

    // Recalculate client to update balance and debt
    const { recalculateService } = await import('./RecalculationService');
    await recalculateService.recalculateClient(payment.client_id);
  }
}

export const paymentService = new PaymentService();
