import {
  Category,
  Employee,
  Feedback,
  Incident,
  ITService,
  SLAPolicy,
  Technician,
  User,
} from '../types/itsm';
import {
  SEED_ADMIN,
  SEED_CATEGORIES,
  SEED_EMPLOYEES,
  SEED_INCIDENTS,
  SEED_SERVICES,
  SEED_SLA_POLICIES,
  SEED_TECHNICIANS,
} from '../data/seedData';

const STORAGE_KEYS = {
  INCIDENTS: 'iitsm_repo_incidents',
  SERVICES: 'iitsm_repo_services',
  CATEGORIES: 'iitsm_repo_categories',
  POLICIES: 'iitsm_repo_sla_policies',
  TECHNICIANS: 'iitsm_repo_technicians',
  USERS: 'iitsm_repo_users',
  FEEDBACK: 'iitsm_repo_feedback',
};

/**
 * Repository Interface
 */
export interface Repository<T, ID = string> {
  findAll(): Promise<T[]>;
  findById(id: ID): Promise<T | null>;
  save(entity: T): Promise<T>;
  deleteById(id: ID): Promise<boolean>;
}

/**
 * Universal Persistent Storage Helper (Works across Browser localStorage and Node fs)
 */
class PersistentStore {
  private inMemoryMap: Map<string, string> = new Map();

  public get(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fallback
      }
    }
    return this.inMemoryMap.get(key) || null;
  }

  public set(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Fallback
      }
    }
    this.inMemoryMap.set(key, value);
  }
}

const store = new PersistentStore();

/**
 * Incident Repository Implementation
 */
export class IncidentRepository implements Repository<Incident, string> {
  private loadAll(): Incident[] {
    const raw = store.get(STORAGE_KEYS.INCIDENTS);
    if (!raw) {
      // First run: seed data
      this.saveAll(SEED_INCIDENTS);
      return [...SEED_INCIDENTS];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [...SEED_INCIDENTS];
    }
  }

  private saveAll(items: Incident[]): void {
    store.set(STORAGE_KEYS.INCIDENTS, JSON.stringify(items));
  }

  public async findAll(): Promise<Incident[]> {
    return this.loadAll();
  }

  public async findById(id: string): Promise<Incident | null> {
    const items = this.loadAll();
    return items.find((i) => i.id === id) || null;
  }

  public async save(entity: Incident): Promise<Incident> {
    const items = this.loadAll();
    const idx = items.findIndex((i) => i.id === entity.id);
    if (idx >= 0) {
      items[idx] = entity;
    } else {
      items.unshift(entity);
    }
    this.saveAll(items);
    return entity;
  }

  public async deleteById(id: string): Promise<boolean> {
    const items = this.loadAll();
    const filtered = items.filter((i) => i.id !== id);
    if (filtered.length !== items.length) {
      this.saveAll(filtered);
      return true;
    }
    return false;
  }

  public async resetToSeed(): Promise<Incident[]> {
    this.saveAll(SEED_INCIDENTS);
    return [...SEED_INCIDENTS];
  }
}

/**
 * ITService Repository Implementation (Full CRUD)
 */
export class ServiceRepository implements Repository<ITService, string> {
  private loadAll(): ITService[] {
    const raw = store.get(STORAGE_KEYS.SERVICES);
    if (!raw) {
      this.saveAll(SEED_SERVICES);
      return [...SEED_SERVICES];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [...SEED_SERVICES];
    }
  }

  private saveAll(items: ITService[]): void {
    store.set(STORAGE_KEYS.SERVICES, JSON.stringify(items));
  }

  public async findAll(): Promise<ITService[]> {
    return this.loadAll();
  }

  public async findById(id: string): Promise<ITService | null> {
    return this.loadAll().find((s) => s.id === id) || null;
  }

  public async save(entity: ITService): Promise<ITService> {
    const items = this.loadAll();
    const idx = items.findIndex((s) => s.id === entity.id);
    if (idx >= 0) {
      items[idx] = entity;
    } else {
      items.push(entity);
    }
    this.saveAll(items);
    return entity;
  }

  public async deleteById(id: string): Promise<boolean> {
    const items = this.loadAll();
    const filtered = items.filter((s) => s.id !== id);
    if (filtered.length !== items.length) {
      this.saveAll(filtered);
      return true;
    }
    return false;
  }
}

/**
 * Category Repository Implementation (Full CRUD)
 */
export class CategoryRepository implements Repository<Category, string> {
  private loadAll(): Category[] {
    const raw = store.get(STORAGE_KEYS.CATEGORIES);
    if (!raw) {
      this.saveAll(SEED_CATEGORIES);
      return [...SEED_CATEGORIES];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [...SEED_CATEGORIES];
    }
  }

  private saveAll(items: Category[]): void {
    store.set(STORAGE_KEYS.CATEGORIES, JSON.stringify(items));
  }

  public async findAll(): Promise<Category[]> {
    return this.loadAll();
  }

  public async findById(id: string): Promise<Category | null> {
    return this.loadAll().find((c) => c.id === id) || null;
  }

  public async save(entity: Category): Promise<Category> {
    const items = this.loadAll();
    const idx = items.findIndex((c) => c.id === entity.id);
    if (idx >= 0) {
      items[idx] = entity;
    } else {
      items.push(entity);
    }
    this.saveAll(items);
    return entity;
  }

  public async deleteById(id: string): Promise<boolean> {
    const items = this.loadAll();
    const filtered = items.filter((c) => c.id !== id);
    if (filtered.length !== items.length) {
      this.saveAll(filtered);
      return true;
    }
    return false;
  }
}

/**
 * SLAPolicy Repository Implementation (Full CRUD)
 */
export class SLAPolicyRepository implements Repository<SLAPolicy, string> {
  private loadAll(): SLAPolicy[] {
    const raw = store.get(STORAGE_KEYS.POLICIES);
    if (!raw) {
      this.saveAll(SEED_SLA_POLICIES);
      return [...SEED_SLA_POLICIES];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [...SEED_SLA_POLICIES];
    }
  }

  private saveAll(items: SLAPolicy[]): void {
    store.set(STORAGE_KEYS.POLICIES, JSON.stringify(items));
  }

  public async findAll(): Promise<SLAPolicy[]> {
    return this.loadAll();
  }

  public async findById(id: string): Promise<SLAPolicy | null> {
    return this.loadAll().find((p) => p.id === id) || null;
  }

  public async findByPriority(priority: string): Promise<SLAPolicy | null> {
    return this.loadAll().find((p) => p.priority === priority) || null;
  }

  public async save(entity: SLAPolicy): Promise<SLAPolicy> {
    const items = this.loadAll();
    const idx = items.findIndex((p) => p.id === entity.id);
    if (idx >= 0) {
      items[idx] = entity;
    } else {
      items.push(entity);
    }
    this.saveAll(items);
    return entity;
  }

  public async deleteById(id: string): Promise<boolean> {
    const items = this.loadAll();
    const filtered = items.filter((p) => p.id !== id);
    if (filtered.length !== items.length) {
      this.saveAll(filtered);
      return true;
    }
    return false;
  }
}

/**
 * User Repository Implementation (Full CRUD with password support)
 */
export type StoredUser = User & {
  passwordHash?: string;
};

export class UserRepository implements Repository<StoredUser, string> {
  private loadAll(): StoredUser[] {
    const raw = store.get(STORAGE_KEYS.USERS);
    if (!raw) {
      const defaultUsers: StoredUser[] = [
        { ...SEED_ADMIN, passwordHash: 'admin123' },
        ...SEED_EMPLOYEES.map((e) => ({ ...e, passwordHash: 'password' })),
        ...SEED_TECHNICIANS.map((t) => ({ ...t, passwordHash: 'password' })),
      ];
      this.saveAll(defaultUsers);
      return defaultUsers;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveAll(items: StoredUser[]): void {
    store.set(STORAGE_KEYS.USERS, JSON.stringify(items));
  }

  public async findAll(): Promise<StoredUser[]> {
    return this.loadAll();
  }

  public async findById(id: string): Promise<StoredUser | null> {
    return this.loadAll().find((u) => u.id === id) || null;
  }

  public async findByUsername(username: string): Promise<StoredUser | null> {
    return this.loadAll().find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
  }

  public async save(entity: StoredUser): Promise<StoredUser> {
    const items = this.loadAll();
    const idx = items.findIndex((u) => u.id === entity.id);
    if (idx >= 0) {
      items[idx] = entity;
    } else {
      items.push(entity);
    }
    this.saveAll(items);
    return entity;
  }

  public async deleteById(id: string): Promise<boolean> {
    const items = this.loadAll();
    const filtered = items.filter((u) => u.id !== id);
    if (filtered.length !== items.length) {
      this.saveAll(filtered);
      return true;
    }
    return false;
  }
}

/**
 * Feedback Repository
 */
export class FeedbackRepository implements Repository<Feedback, string> {
  private loadAll(): Feedback[] {
    const raw = store.get(STORAGE_KEYS.FEEDBACK);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  private saveAll(items: Feedback[]): void {
    store.set(STORAGE_KEYS.FEEDBACK, JSON.stringify(items));
  }

  public async findAll(): Promise<Feedback[]> {
    return this.loadAll();
  }

  public async findById(id: string): Promise<Feedback | null> {
    return this.loadAll().find((f) => f.id === id) || null;
  }

  public async findByIncidentId(incidentId: string): Promise<Feedback | null> {
    return this.loadAll().find((f) => f.incidentId === incidentId) || null;
  }

  public async save(entity: Feedback): Promise<Feedback> {
    const items = this.loadAll();
    items.unshift(entity);
    this.saveAll(items);
    return entity;
  }

  public async deleteById(id: string): Promise<boolean> {
    const items = this.loadAll();
    const filtered = items.filter((f) => f.id !== id);
    this.saveAll(filtered);
    return true;
  }
}

/**
 * Dedicated Technician Repository Implementation
 */
export class TechnicianRepository implements Repository<Technician, string> {
  private loadAll(): Technician[] {
    const raw = store.get(STORAGE_KEYS.TECHNICIANS);
    if (!raw) {
      this.saveAll(SEED_TECHNICIANS);
      return [...SEED_TECHNICIANS];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [...SEED_TECHNICIANS];
    }
  }

  private saveAll(items: Technician[]): void {
    store.set(STORAGE_KEYS.TECHNICIANS, JSON.stringify(items));
  }

  public async findAll(): Promise<Technician[]> {
    return this.loadAll();
  }

  public async findById(id: string): Promise<Technician | null> {
    return this.loadAll().find((t) => t.id === id) || null;
  }

  public async save(entity: Technician): Promise<Technician> {
    const items = this.loadAll();
    const idx = items.findIndex((t) => t.id === entity.id);
    if (idx >= 0) {
      items[idx] = entity;
    } else {
      items.push(entity);
    }
    this.saveAll(items);
    return entity;
  }

  public async deleteById(id: string): Promise<boolean> {
    const items = this.loadAll();
    const filtered = items.filter((t) => t.id !== id);
    if (filtered.length !== items.length) {
      this.saveAll(filtered);
      return true;
    }
    return false;
  }

  public async resetToSeed(): Promise<Technician[]> {
    this.saveAll(SEED_TECHNICIANS);
    return [...SEED_TECHNICIANS];
  }
}

/**
 * Universal Repository Manager for Database Snapshotting and Restores
 */
export class RepositoryStore {
  public static exportAll(): Record<string, any> {
    if (!store.get(STORAGE_KEYS.INCIDENTS)) {
      this.resetAll();
    }
    const result: Record<string, any> = {};
    for (const [keyName, storageKey] of Object.entries(STORAGE_KEYS)) {
      const val = store.get(storageKey);
      if (val) {
        try {
          result[keyName] = JSON.parse(val);
        } catch {
          result[keyName] = val;
        }
      }
    }
    return result;
  }

  public static importAll(data: Record<string, any>): void {
    if (!data || typeof data !== 'object') return;
    for (const [keyName, storageKey] of Object.entries(STORAGE_KEYS)) {
      if (data[keyName]) {
        store.set(storageKey, JSON.stringify(data[keyName]));
      }
    }
  }

  public static resetAll(): void {
    store.set(STORAGE_KEYS.INCIDENTS, JSON.stringify(SEED_INCIDENTS));
    store.set(STORAGE_KEYS.SERVICES, JSON.stringify(SEED_SERVICES));
    store.set(STORAGE_KEYS.CATEGORIES, JSON.stringify(SEED_CATEGORIES));
    store.set(STORAGE_KEYS.POLICIES, JSON.stringify(SEED_SLA_POLICIES));
    store.set(STORAGE_KEYS.TECHNICIANS, JSON.stringify(SEED_TECHNICIANS));
    store.set(
      STORAGE_KEYS.USERS,
      JSON.stringify([
        { ...SEED_ADMIN, passwordHash: 'admin123' },
        ...SEED_EMPLOYEES.map((e) => ({ ...e, passwordHash: 'password' })),
        ...SEED_TECHNICIANS.map((t) => ({ ...t, passwordHash: 'password' })),
      ])
    );
  }
}

// Global Repository Singletons
export const incidentRepo = new IncidentRepository();
export const serviceRepo = new ServiceRepository();
export const categoryRepo = new CategoryRepository();
export const slaPolicyRepo = new SLAPolicyRepository();
export const userRepo = new UserRepository();
export const technicianRepo = new TechnicianRepository();
export const feedbackRepo = new FeedbackRepository();

