// Database types

export type ClientStatus = 'active' | 'paused' | 'archived';

export interface Client {
  id: string;
  full_name: string;
  phone?: string;
  telegram?: string;
  notes?: string;
  status: ClientStatus;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduleRule {
  rule_id: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Monday, 7=Sunday
  start_time: string; // HH:mm format
  duration_minutes: number;
  is_active: boolean;
  base_price?: number; // Base price for sessions generated from this rule
}

export interface ScheduleTemplate {
  id: string;
  client_id: string;
  timezone: string; // IANA timezone
  rules: ScheduleRule[];
  generation_horizon_days: number;
  created_at: Date;
  updated_at: Date;
}

export type SessionStatus = 'planned' | 'completed' | 'canceled';

export interface CalendarSession {
  id: string;
  client_id: string;
  date: string; // ISO date (YYYY-MM-DD)
  start_time: string; // HH:mm format
  duration_minutes: number;
  status: SessionStatus;
  template_rule_id?: string;
  is_custom: boolean;
  price_override?: number;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export type PackageStatus = 'active' | 'exhausted' | 'expired';

export interface Package {
  id: string;
  client_id: string;
  title: string;
  total_price: number;
  sessions_count: number;
  allocation_mode: 'money';
  status: PackageStatus;
  valid_from?: Date;
  valid_until?: Date;
  created_at: Date;
  updated_at: Date;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface Payment {
  id: string;
  client_id: string;
  paid_at: Date;
  amount: number;
  method: PaymentMethod;
  comment?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  session_id: string;
  allocated_amount: number;
  created_at: Date;
}

// DTOs for creating entities
export interface CreateClientDto {
  full_name: string;
  phone?: string;
  telegram?: string;
  notes?: string;
}

export interface CreateTemplateDto {
  timezone?: string;
  rules: Omit<ScheduleRule, 'rule_id'>[];
  generation_horizon_days?: number;
}

export interface CreateSessionDto {
  date: string;
  start_time: string;
  duration_minutes: number;
  price_override?: number;
  notes?: string;
}

export interface CreatePackageDto {
  title: string;
  total_price: number;
  sessions_count: number;
  valid_from?: Date;
  valid_until?: Date;
}

export interface CreatePaymentDto {
  paid_at: Date;
  amount: number;
  method: PaymentMethod;
  comment?: string;
}

export interface AllocationDto {
  session_id: string;
  amount: number;
}

// Analytics types
export interface ClientStats {
  total_sessions: number;
  paid_sessions: number;
  unpaid_sessions: number;
  partially_paid_sessions: number;
  total_paid: number;
  total_allocated: number;
  total_debt: number;
  balance: number;
  next_unpaid_session: CalendarSession | null;
}

export interface MonthlyStats {
  month: Date;
  total_clients: number;
  total_sessions: number;
  total_payments: number;
  total_debt: number;
}
