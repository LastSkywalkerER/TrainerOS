import { getDb } from '../db/rxdb';
import { PaymentAllocation, AllocationDto } from '../db/types';
import { generateId } from '../utils/uuid';
import { calculateSessionStatus } from '../utils/calculations';
import { recalculateService } from './RecalculationService';
import {
  toPaymentAllocationEntity,
  paymentAllocationToDb,
  stripUndefined,
} from '../db/dateHelpers';

export class AllocationService {
  async allocate(
    paymentId: string,
    sessionId: string,
    amount: number
  ): Promise<PaymentAllocation> {
    if (amount <= 0) {
      throw new Error('Allocation amount must be positive');
    }

    const db = await getDb();

    // Check if allocation already exists
    const existingDocs = await db.payment_allocations.find({
      selector: { payment_id: paymentId, session_id: sessionId },
    }).exec();

    if (existingDocs.length > 0) {
      const existingDoc = existingDocs[0];
      const existing = toPaymentAllocationEntity(existingDoc.toJSON());
      const updated: PaymentAllocation = {
        ...existing,
        allocated_amount: existing.allocated_amount + amount,
      };
      await existingDoc.patch(stripUndefined(paymentAllocationToDb(updated)));
      await recalculateService.recalculateSession(sessionId);
      return updated;
    }

    // Create new allocation
    const allocation: PaymentAllocation = {
      id: generateId(),
      payment_id: paymentId,
      session_id: sessionId,
      allocated_amount: amount,
      created_at: new Date(),
    };

    await db.payment_allocations.insert(stripUndefined(paymentAllocationToDb(allocation)));
    await recalculateService.recalculateSession(sessionId);
    return allocation;
  }

  async deallocate(allocationId: string): Promise<void> {
    const db = await getDb();
    const doc = await db.payment_allocations.findOne(allocationId).exec();
    if (!doc) {
      throw new Error(`Allocation with id ${allocationId} not found`);
    }

    const sessionId = doc.toJSON().session_id;
    await doc.remove();
    await recalculateService.recalculateSession(sessionId);
  }

  async reallocate(
    paymentId: string,
    allocations: AllocationDto[]
  ): Promise<void> {
    const db = await getDb();

    // Remove existing allocations for this payment
    const existingDocs = await db.payment_allocations.find({
      selector: { payment_id: paymentId },
    }).exec();

    const sessionIds = new Set<string>();
    for (const doc of existingDocs) {
      sessionIds.add(doc.toJSON().session_id);
      await doc.remove();
    }

    // Create new allocations
    for (const alloc of allocations) {
      sessionIds.add(alloc.session_id);
      await this.allocate(paymentId, alloc.session_id, alloc.amount);
    }

    // Recalculate all affected sessions
    for (const sessionId of sessionIds) {
      await recalculateService.recalculateSession(sessionId);
    }
  }

  async getBySession(sessionId: string): Promise<PaymentAllocation[]> {
    const db = await getDb();
    const docs = await db.payment_allocations.find({ selector: { session_id: sessionId } }).exec();
    return docs.map((d: any) => toPaymentAllocationEntity(d.toJSON()));
  }

  async getByPayment(paymentId: string): Promise<PaymentAllocation[]> {
    const db = await getDb();
    const docs = await db.payment_allocations.find({ selector: { payment_id: paymentId } }).exec();
    return docs.map((d: any) => toPaymentAllocationEntity(d.toJSON()));
  }

  async calculateSessionStatus(
    sessionId: string
  ): Promise<'paid' | 'partially_paid' | 'unpaid'> {
    return calculateSessionStatus(sessionId);
  }

  async getAllocatedAmount(sessionId: string): Promise<number> {
    const allocations = await this.getBySession(sessionId);
    return allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
  }
}

export const allocationService = new AllocationService();
