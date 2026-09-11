/**
 * Marcador idempotente da carga oficial HEF.
 * Tabela criada on-the-fly (sem migration) para o reset one-shot no Railway.
 */
export const INVENTARIO_OFICIAL_CHAVE = "inventario_oficial_hef_v2";
/** Segundo passo: impede laudos/planos HRTC de recriar OS depois do wipe oficial. */
export const INVENTARIO_OFICIAL_SEM_HRTC_CHAVE = "inventario_oficial_hef_v2_sem_hrtc";

export function envFlagAtiva(nome) {
  const v = process.env[nome];
  return v === "1" || v === "true";
}

export function hostDatabase(url = process.env.DATABASE_URL) {
  try {
    return url ? new URL(url).hostname : "(sem DATABASE_URL)";
  } catch {
    return "(URL inválida)";
  }
}

export function isLocalDatabase(url = process.env.DATABASE_URL) {
  const host = hostDatabase(url);
  return host === "localhost" || host === "127.0.0.1" || host === "db" || host === "::1";
}

export async function ensureCargaInventarioTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CargaInventario" (
      "chave" TEXT PRIMARY KEY,
      "aplicadaEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "detalhes" JSONB
    )
  `);
}

export async function cargaInventarioExiste(prisma, chave = INVENTARIO_OFICIAL_CHAVE) {
  await ensureCargaInventarioTable(prisma);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT chave FROM "CargaInventario" WHERE chave = $1 LIMIT 1`,
    chave,
  );
  return Array.isArray(rows) && rows.length > 0;
}

export async function registrarCargaInventario(
  prisma,
  detalhes,
  chave = INVENTARIO_OFICIAL_CHAVE,
) {
  await ensureCargaInventarioTable(prisma);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CargaInventario" ("chave", "aplicadaEm", "detalhes")
     VALUES ($1, NOW(), $2::jsonb)
     ON CONFLICT ("chave") DO UPDATE SET
       "aplicadaEm" = NOW(),
       "detalhes" = EXCLUDED."detalhes"`,
    chave,
    JSON.stringify(detalhes ?? {}),
  );
}
