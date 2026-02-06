import { getDb } from '../db/rxdb';
import { Package, CreatePackageDto } from '../db/types';
import { generateId } from '../utils/uuid';
import { calculateSessionPrice } from '../utils/calculations';
import {
  toPackageEntity,
  packageToDb,
  stripUndefined,
} from '../db/dateHelpers';

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

    const db = await getDb();
    await db.packages.insert(stripUndefined(packageToDb(packageEntity)));
    return packageEntity;
  }

  async update(
    id: string,
    updates: Partial<Package>
  ): Promise<Package> {
    const db = await getDb();
    const doc = await db.packages.findOne(id).exec();
    if (!doc) {
      throw new Error(`Package with id ${id} not found`);
    }

    const pkg = toPackageEntity(doc.toJSON());
    const updated: Package = {
      ...pkg,
      ...updates,
      updated_at: new Date(),
    };

    await doc.patch(stripUndefined(packageToDb(updated)));
    return updated;
  }

  async getActiveByClient(clientId: string): Promise<Package | null> {
    const db = await getDb();
    const docs = await db.packages.find({
      selector: { client_id: clientId, status: 'active' },
    }).exec();

    const packages = docs.map((d: any) => toPackageEntity(d.toJSON()));
    packages.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    return packages.length > 0 ? packages[packages.length - 1] : null;
  }

  async getAllByClient(clientId: string): Promise<Package[]> {
    const db = await getDb();
    const docs = await db.packages.find({ selector: { client_id: clientId } }).exec();
    const packages = docs.map((d: any) => toPackageEntity(d.toJSON()));
    packages.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    return packages;
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
    const db = await getDb();
    const docs = await db.packages.find({ selector: { status: 'active' } }).exec();

    for (const doc of docs) {
      const pkg = toPackageEntity(doc.toJSON());
      if (pkg.valid_until && pkg.valid_until < now) {
        await this.markAsExpired(pkg.id);
      }
    }
  }
}

export const packageService = new PackageService();
