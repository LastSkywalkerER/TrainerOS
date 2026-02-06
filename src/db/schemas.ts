// RxDB JSON Schema definitions for all collections

import type { RxJsonSchema } from 'rxdb';

export const clientSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    full_name: { type: 'string', maxLength: 200 },
    phone: { type: 'string' },
    telegram: { type: 'string' },
    notes: { type: 'string' },
    status: { type: 'string', enum: ['active', 'paused', 'archived'], maxLength: 20 },
    start_date: { type: 'string', format: 'date-time' },
    pause_from: { type: 'string', format: 'date-time' },
    pause_to: { type: 'string', format: 'date-time' },
    archive_date: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'full_name', 'status', 'start_date', 'created_at', 'updated_at'],
  indexes: ['status', 'full_name'],
};

export const scheduleTemplateSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    client_id: { type: 'string', maxLength: 100 },
    timezone: { type: 'string' },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule_id: { type: 'string' },
          weekday: { type: 'number', minimum: 1, maximum: 7 },
          start_time: { type: 'string' },
          is_active: { type: 'boolean' },
          base_price: { type: 'number' },
        },
        required: ['rule_id', 'weekday', 'start_time', 'is_active'],
      },
    },
    generation_horizon_days: { type: 'number' },
    valid_from: { type: 'string', format: 'date-time' },
    valid_to: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'client_id', 'timezone', 'rules', 'generation_horizon_days', 'created_at', 'updated_at'],
  indexes: ['client_id'],
};

export const calendarSessionSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    client_id: { type: 'string', maxLength: 100 },
    date: { type: 'string', maxLength: 10 }, // YYYY-MM-DD
    start_time: { type: 'string' },
    status: { type: 'string', enum: ['planned', 'completed', 'canceled'], maxLength: 20 },
    template_rule_id: { type: 'string' },
    is_custom: { type: 'boolean' },
    is_edited: { type: 'boolean' },
    price_override: { type: 'number' },
    notes: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'client_id', 'date', 'start_time', 'status', 'is_custom', 'created_at', 'updated_at'],
  indexes: ['client_id', 'date', 'status', ['client_id', 'date']],
};

export const packageSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    client_id: { type: 'string', maxLength: 100 },
    title: { type: 'string' },
    total_price: { type: 'number' },
    sessions_count: { type: 'number' },
    allocation_mode: { type: 'string', maxLength: 20 },
    status: { type: 'string', enum: ['active', 'exhausted', 'expired'], maxLength: 20 },
    valid_from: { type: 'string', format: 'date-time' },
    valid_until: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'client_id', 'title', 'total_price', 'sessions_count', 'allocation_mode', 'status', 'created_at', 'updated_at'],
  indexes: ['client_id', 'status'],
};

export const paymentSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    client_id: { type: 'string', maxLength: 100 },
    paid_at: { type: 'string', format: 'date-time', maxLength: 50 },
    amount: { type: 'number' },
    method: { type: 'string', enum: ['cash', 'card', 'transfer', 'other'], maxLength: 20 },
    comment: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'client_id', 'paid_at', 'amount', 'method', 'created_at', 'updated_at'],
  indexes: ['client_id', 'paid_at'],
};

export const paymentAllocationSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    payment_id: { type: 'string', maxLength: 100 },
    session_id: { type: 'string', maxLength: 100 },
    allocated_amount: { type: 'number' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'payment_id', 'session_id', 'allocated_amount', 'created_at'],
  indexes: ['payment_id', 'session_id', ['payment_id', 'session_id']],
};
