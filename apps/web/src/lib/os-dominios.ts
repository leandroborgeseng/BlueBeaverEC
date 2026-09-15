import { api } from "@/lib/api";
import { OS_DOMINIO_TIPOS, type OsDominioTipo } from "@aion/shared";

export type OsDominioValor = {
  id: string;
  tipo: string;
  codigo: string | null;
  nome: string;
  ativo: boolean;
  ordem: number;
};

export type OsDominiosMap = Record<OsDominioTipo, OsDominioValor[]>;

export function mapaDominiosVazio(): OsDominiosMap {
  return Object.fromEntries(OS_DOMINIO_TIPOS.map((t) => [t, [] as OsDominioValor[]])) as OsDominiosMap;
}

export function agruparDominios(rows: OsDominioValor[]): OsDominiosMap {
  const map = mapaDominiosVazio();
  for (const r of rows) {
    if (r.tipo in map) map[r.tipo as OsDominioTipo].push(r);
  }
  return map;
}

export function nomesDominio(
  map: OsDominiosMap | null | undefined,
  tipo: OsDominioTipo,
  extras: Array<string | null | undefined> = [],
) {
  const cadastro = (map?.[tipo] ?? []).filter((d) => d.ativo).map((d) => d.nome);
  return Array.from(new Set([...cadastro, ...extras.filter((x): x is string => Boolean(x?.trim()))]));
}

export async function carregarOsDominios() {
  const rows = await api<OsDominioValor[]>("/os-dominios");
  return agruparDominios(rows);
}
