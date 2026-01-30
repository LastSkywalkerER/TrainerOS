export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePhone(phone: string): boolean {
  const re = /^[\d\s\-\+\(\)]+$/;
  return re.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

export function validateTime(time: string): boolean {
  const re = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return re.test(time);
}

export function validateDate(date: string): boolean {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(date)) {
    return false;
  }
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

export function validatePositiveNumber(value: number): boolean {
  return value > 0 && isFinite(value);
}
