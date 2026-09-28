export interface HealthStatus {
  status: 'ok';
}

// Liveness only; a database check can join here once FOUNDATION-004 adds Prisma.
export function getStatus(): HealthStatus {
  return { status: 'ok' };
}
