// src/utils/permissions.ts
export const canAccess = (role: string, allowed: string[]) =>
  allowed.includes(role);
