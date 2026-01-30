import { db } from '../db/database';
import { PaymentAllocation, AllocationDto } from '../db/types';
import { generateId } from '../utils/uuid';
import { calculateSessionStatus } from '../utils/calculations';
import { recalculateService } from './RecalculationService';

export class AllocationService {
  async allocate(
    paymentId: string,
    sessionId: string,
    amount: number
  ): Promise<PaymentAllocation> {
    if (amount <= 0) {
      throw new Error('Allocation amount must be positive');
    }

    // Check if allocation already exists
    const existing = await db.paymentAllocations
      .where('[payment_id+session_id]')
      .equals([paymentId, sessionId])
      .first();

    if (existing) {
      // Update existing allocation
      const updated: PaymentAllocation = {
        ...existing,
        allocated_amount: existing.allocated_amount + amount,
      };
      await db.paymentAllocations.update(existing.id, updated);
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

    await db.paymentAllocations.add(allocation);
    await recalculateService.recalculateSession(sessionId);
    return allocation;
  }

  async deallocate(allocationId: string): Promise<void> {
    const allocation = await db.paymentAllocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Allocation with id ${allocationId} not found`);
    }

    const sessionId = allocation.session_id;
    await db.paymentAllocations.delete(allocationId);
    await recalculateService.recalculateSession(sessionId);
  }

  async reallocate(
    paymentId: string,
    allocations: AllocationDto[]
  ): Promise<void> {
    // Remove existing allocations for this payment
    const existing = await db.paymentAllocations
      .where('payment_id')
      .equals(paymentId)
      .toArray();

    const sessionIds = new Set<string>();
    for (const alloc of existing) {
      sessionIds.add(alloc.session_id);
      await db.paymentAllocations.delete(alloc.id);
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
    return db.paymentAllocations
      .where('session_id')
      .equals(sessionId)
      .toArray();
  }

  async getByPayment(paymentId: string): Promise<PaymentAllocation[]> {
    return db.paymentAllocations
      .where('payment_id')
      .equals(paymentId)
      .toArray();
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
