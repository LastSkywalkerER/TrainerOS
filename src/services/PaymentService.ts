import { db } from '../db/database';
import { Payment, CreatePaymentDto } from '../db/types';
import { generateId } from '../utils/uuid';
import { allocationService } from './AllocationService';

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

    await db.payments.add(paymentEntity);
    return paymentEntity;
  }

  async update(
    id: string,
    updates: Partial<Payment>
  ): Promise<Payment> {
    const payment = await db.payments.get(id);
    if (!payment) {
      throw new Error(`Payment with id ${id} not found`);
    }

    const updated: Payment = {
      ...payment,
      ...updates,
      updated_at: new Date(),
    };

    await db.payments.update(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    // Delete all allocations first
    const allocations = await db.paymentAllocations
      .where('payment_id')
      .equals(id)
      .toArray();

    const sessionIds = allocations.map((a) => a.session_id);

    await db.paymentAllocations.where('payment_id').equals(id).delete();
    await db.payments.delete(id);

    // Recalculate affected sessions
    const { recalculateService } = await import('./RecalculationService');
    for (const sessionId of sessionIds) {
      await recalculateService.recalculateSession(sessionId);
    }
  }

  async getAllByClient(clientId: string): Promise<Payment[]> {
    return db.payments
      .where('client_id')
      .equals(clientId)
      .sortBy('paid_at');
  }

  async getAll(): Promise<Payment[]> {
    return db.payments.orderBy('paid_at').reverse().toArray();
  }

  async autoAllocate(paymentId: string): Promise<void> {
    const payment = await db.payments.get(paymentId);
    if (!payment) {
      throw new Error(`Payment with id ${paymentId} not found`);
    }

    // Get unpaid sessions for the client, ordered by date
    const sessions = await db.calendarSessions
      .where('client_id')
      .equals(payment.client_id)
      .and((s) => s.status !== 'canceled')
      .sortBy('date');

    let remainingAmount = payment.amount;

    for (const session of sessions) {
      if (remainingAmount <= 0) {
        break;
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
  }
}

export const paymentService = new PaymentService();
