/**
 * Helpers de isolamento multi-tenant.
 * Preferir sempre `estabelecimentoId` no `where` / compound unique.
 * Prisma $extends global fica para onda futura (ALS de request).
 */
export function tenantWhere(estabelecimentoId: string) {
  return { estabelecimentoId } as const;
}

export function assertSameTenant(
  rowEstabelecimentoId: string | null | undefined,
  estabelecimentoId: string,
): boolean {
  return Boolean(rowEstabelecimentoId && rowEstabelecimentoId === estabelecimentoId);
}
