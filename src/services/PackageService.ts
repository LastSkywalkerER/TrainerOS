import { db } from '../db/database';
import { Package, CreatePackageDto } from '../db/types';
import { generateId } from '../utils/uuid';
import { calculateSessionPrice } from '../utils/calculations';

export class PackageService {
  async create(clientId: string, pkg: CreatePackageDto): Promise<Package> {
    const now = new Date();
    const packageEntity: Package = {
      id: generateId(),
      client_id: clientId,
      title: pkg.title,
      total_price: pkg.total_price,
      sessions_count: pkg.sessions_count,
      allocation_mode: 'money',
      status: 'active',
      valid_from: pkg.valid_from,
      valid_until: pkg.valid_until,
      created_at: now,
      updated_at: now,
    };

    await db.packages.add(packageEntity);
    return packageEntity;
  }

  async update(
    id: string,
    updates: Partial<Package>
  ): Promise<Package> {
    const pkg = await db.packages.get(id);
    if (!pkg) {
      throw new Error(`Package with id ${id} not found`);
    }

    const updated: Package = {
      ...pkg,
      ...updates,
      updated_at: new Date(),
    };

    await db.packages.update(id, updated);
    return updated;
  }

  async getActiveByClient(clientId: string): Promise<Package | null> {
    const packages = await db.packages
      .where('client_id')
      .equals(clientId)
      .and((p) => p.status === 'active')
      .sortBy('created_at');

    // Return the most recent active package
    return packages.length > 0 ? packages[packages.length - 1] : null;
  }

  async getAllByClient(clientId: string): Promise<Package[]> {
    return db.packages
      .where('client_id')
      .equals(clientId)
      .sortBy('created_at');
  }

  async calculateSessionPrice(
    clientId: string,
    sessionId: string
  ): Promise<number> {
    return calculateSessionPrice(clientId, sessionId);
  }

  async markAsExhausted(id: string): Promise<void> {
    await this.update(id, { status: 'exhausted' });
  }

  async markAsExpired(id: string): Promise<void> {
    await this.update(id, { status: 'expired' });
  }

  async checkExpiredPackages(): Promise<void> {
    const now = new Date();
    const packages = await db.packages
      .where('status')
      .equals('active')
      .toArray();

    for (const pkg of packages) {
      if (pkg.valid_until && pkg.valid_until < now) {
        await this.markAsExpired(pkg.id);
      }
    }
  }
}

export const packageService = new PackageService();
