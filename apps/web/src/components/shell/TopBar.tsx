"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearToken, setToken } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import { ICONS, Icon } from "./icons";

interface Estab {
  id: string;
  nome: string;
  perfil: string;
}

interface BuscaResult {
  equipamentos: Array<{ tag: string; nome: string; situacao: string; setor?: { nome: string } }>;
  os: Array<{
    numero: number;
    codigo: string;
    status: string;
    prioridade: string;
    equipamento: { tag: string; nome: string };
  }>;
  contratos: Array<{ numero: string; descricao: string; fornecedor?: { nome: string } }>;
}

interface Notificacao {
  id: string;
  titulo: string;
  detalhe: string;
  href: string;
  severidade: "info" | "warning" | "danger";
}

interface Recente {
  id: string;
  label: string;
  hint: string;
  kind: "os" | "equipamento";
  payload: Record<string, unknown>;
}

interface TopBarProps {
  nome?: string;
  estabelecimentoId?: string;
  estabelecimentoNome?: string;
  perfil?: string;
  estabelecimentos?: Estab[];
  onSwitched?: () => void;
}

function initials(nome?: string) {
  if (!nome) return "NX";
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "AI";
}

export function TopBar({
  nome,
  estabelecimentoId,
  estabelecimentoNome,
  perfil,
  estabelecimentos = [],
  onSwitched,
}: TopBarProps) {
  const pathname = usePathname();
  const openWindow = useWindowStore((s) => s.open);
  const [panel, setPanel] = useState<"perfil" | "notif" | "busca" | "recentes" | "favoritos" | null>(null);
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState<BuscaResult | null>(null);
  const [buscaLoading, setBuscaLoading] = useState(false);
  const [notifs, setNotifs] = useState<{ items: Notificacao[]; unread: number } | null>(null);
  const [recentes, setRecentes] = useState<Recente[]>([]);
  const [favoritos, setFavoritos] = useState<Array<{ id: string; label: string; href: string }>>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBusca = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setBusca(null);
      return;
    }
    setBuscaLoading(true);
    try {
      const res = await api<BuscaResult>(`/nav/busca?q=${encodeURIComponent(term.trim())}`);
      setBusca(res);
    } catch {
      setBusca({ equipamentos: [], os: [], contratos: [] });
    } finally {
      setBuscaLoading(false);
    }
  }, []);

  useEffect(() => {
    void api<{ items: Notificacao[]; unread: number }>("/notificacoes")
      .then(setNotifs)
      .catch(() => setNotifs({ items: [], unread: 0 }));
  }, []);

  useEffect(() => {
    if (panel !== "busca") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchBusca(q), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, panel, fetchBusca]);

  useEffect(() => {
    if (panel === "notif") {
      void api<{ items: Notificacao[]; unread: number }>("/notificacoes")
        .then(setNotifs)
        .catch(() => setNotifs({ items: [], unread: 0 }));
    }
    if (panel === "recentes" && recentes.length === 0) {
      void api<Recente[]>("/nav/recentes")
        .then(setRecentes)
        .catch(() => setRecentes([]));
    }
    if (panel === "favoritos" && favoritos.length === 0) {
      void api<Array<{ id: string; label: string; href: string }>>("/nav/favoritos")
        .then((defaults) => {
          try {
            const raw = localStorage.getItem("aion_favoritos");
            const saved = raw ? (JSON.parse(raw) as Array<{ id: string; label: string; href: string }>) : [];
            setFavoritos(Array.isArray(saved) && saved.length > 0 ? saved : defaults);
          } catch {
            setFavoritos(defaults);
          }
        })
        .catch(() => setFavoritos([]));
    }
  }, [panel, recentes.length, favoritos.length]);

  function salvarFavoritoAtual() {
    const href = pathname || "/dashboard";
    const label = href.replace(/^\//, "").replace(/\//g, " · ") || "Dashboard";
    const next = [
      { id: href, label, href },
      ...favoritos.filter((f) => f.href !== href),
    ].slice(0, 12);
    setFavoritos(next);
    localStorage.setItem("aion_favoritos", JSON.stringify(next));
  }
  async function trocar(id: string) {
    if (!id || id === estabelecimentoId) return;
    const res = await api<{ accessToken: string }>("/auth/switch-estabelecimento", {
      method: "POST",
      body: JSON.stringify({ estabelecimentoId: id }),
    });
    setToken(res.accessToken);
    onSwitched?.();
    window.location.reload();
  }

  function logout() {
    void api("/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        clearToken();
        window.location.href = "/login";
      });
  }

  function abrirOs(o: BuscaResult["os"][0]) {
    openWindow({
      kind: "os",
      title: `${o.codigo} — ${o.equipamento.nome} · ${o.equipamento.tag}`,
      payload: { numero: o.numero, codigo: o.codigo },
    });
    setPanel(null);
  }

  function abrirEquip(e: BuscaResult["equipamentos"][0]) {
    openWindow({
      kind: "equipamento",
      title: `${e.tag} — ${e.nome}`,
      payload: { tag: e.tag },
    });
    setPanel(null);
  }

  function abrirRecente(r: Recente) {
    if (r.kind === "os") {
      openWindow({
        kind: "os",
        title: String(r.label),
        payload: r.payload,
      });
    } else {
      openWindow({
        kind: "equipamento",
        title: `${r.payload.tag} — ${r.hint}`,
        payload: r.payload,
      });
    }
    setPanel(null);
  }

  const iconBtn: React.CSSProperties = {
    width: 32,
    height: 32,
    border: "none",
    background: "transparent",
    borderRadius: 6,
    cursor: "pointer",
    color: "oklch(0.5 0.05 255)",
    display: "grid",
    placeItems: "center",
    position: "relative",
    padding: 0,
  };

  const panelWidth =
    panel === "busca" ? 360 : panel === "perfil" ? 240 : panel === "favoritos" ? 260 : 320;

  return (
    <header
      style={{
        height: 58,
        flexShrink: 0,
        borderBottom: "1px solid oklch(0.91 0.006 255)",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "0 22px",
        position: "relative",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <img src="/bluebeaver-logo.png" alt="" style={{ height: 26, borderRadius: 5 }} />
        <div style={{ width: 1, height: 18, background: "oklch(0.91 0.006 255)", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, color: "oklch(0.32 0.015 255)" }}>
          <Icon d={ICONS.building} size={15} />
          {estabelecimentos.length > 1 ? (
            <select
              value={estabelecimentoId}
              onChange={(e) => void trocar(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 13.5,
                fontWeight: 600,
                color: "oklch(0.32 0.015 255)",
                maxWidth: 320,
                cursor: "pointer",
              }}
            >
              {estabelecimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{estabelecimentoNome ?? "Estabelecimento"}</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          type="button"
          title="Busca global"
          style={iconBtn}
          onClick={() => setPanel((p) => (p === "busca" ? null : "busca"))}
        >
          <Icon d={ICONS.search} size={18} />
        </button>
        <button
          type="button"
          title="Favoritos"
          style={iconBtn}
          onClick={() => setPanel((p) => (p === "favoritos" ? null : "favoritos"))}
        >
          <Icon d={ICONS.star} size={18} />
        </button>
        <button
          type="button"
          title="Recentes"
          style={iconBtn}
          onClick={() => setPanel((p) => (p === "recentes" ? null : "recentes"))}
        >
          <Icon d={ICONS.clock} size={18} />
        </button>
        <button type="button" title="Ajuda" style={iconBtn}>
          <Icon d={ICONS.help} size={18} />
        </button>
        <button
          type="button"
          title="Notificações"
          style={{ ...iconBtn, marginRight: 8 }}
          onClick={() => setPanel((p) => (p === "notif" ? null : "notif"))}
        >
          <Icon d={ICONS.bell} size={18} />
          {(notifs?.unread ?? 0) > 0 && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 5,
                width: 8,
                height: 8,
                borderRadius: 99,
                background: "oklch(0.6 0.19 25)",
                border: "1.5px solid white",
              }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => setPanel((p) => (p === "perfil" ? null : "perfil"))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid oklch(0.88 0.008 255)",
            background: "white",
            cursor: "pointer",
            padding: "4px 9px",
            borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.35 0.02 250)" }}>{perfil ?? "Perfil"}</span>
          <span style={{ fontSize: 10, color: "oklch(0.55 0.02 250)" }}>▾</span>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "oklch(0.55 0.16 255)",
              color: "white",
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initials(nome)}
          </span>
        </button>
      </div>

      {panel && (
        <>
          <div onClick={() => setPanel(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute",
              top: 54,
              right: panel === "busca" ? 120 : 12,
              width: panelWidth,
              maxHeight: 420,
              overflowY: "auto",
              background: "white",
              border: "1px solid oklch(0.91 0.006 255)",
              borderRadius: 10,
              boxShadow: "0 18px 40px -20px rgba(16,24,40,0.35)",
              zIndex: 41,
              padding: 8,
            }}
          >
            {panel === "busca" ? (
              <>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar equipamentos, OS, contratos…"
                  style={{
                    width: "100%",
                    border: "1px solid oklch(0.87 0.008 255)",
                    borderRadius: 7,
                    padding: "9px 10px",
                    fontSize: 13,
                    marginBottom: 8,
                  }}
                />
                {buscaLoading && (
                  <div style={{ padding: "8px 10px", fontSize: 13, color: "oklch(0.5 0.02 250)" }}>Buscando…</div>
                )}
                {!buscaLoading && q.trim().length >= 2 && busca && (
                  <div style={{ display: "grid", gap: 4 }}>
                    {busca.equipamentos.length > 0 && (
                      <Section title="Equipamentos">
                        {busca.equipamentos.map((e) => (
                          <ResultBtn key={e.tag} onClick={() => abrirEquip(e)}>
                            <strong>{e.tag}</strong> — {e.nome}
                            <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>{e.setor?.nome}</div>
                          </ResultBtn>
                        ))}
                      </Section>
                    )}
                    {busca.os.length > 0 && (
                      <Section title="Ordens de Serviço">
                        {busca.os.map((o) => (
                          <ResultBtn key={o.numero} onClick={() => abrirOs(o)}>
                            <strong>{o.codigo}</strong> — {o.equipamento.tag}
                          </ResultBtn>
                        ))}
                      </Section>
                    )}
                    {busca.contratos.length > 0 && (
                      <Section title="Contratos">
                        {busca.contratos.map((c) => (
                          <Link
                            key={c.numero}
                            href="/contratos"
                            onClick={() => setPanel(null)}
                            style={resultLink}
                          >
                            <strong>{c.numero}</strong> — {c.descricao}
                          </Link>
                        ))}
                      </Section>
                    )}
                    {busca.equipamentos.length === 0 &&
                      busca.os.length === 0 &&
                      busca.contratos.length === 0 && (
                        <div style={{ padding: "8px 10px", fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
                          Nenhum resultado.
                        </div>
                      )}
                  </div>
                )}
                {q.trim().length < 2 && (
                  <div style={{ padding: "8px 10px", fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                    Digite ao menos 2 caracteres.
                  </div>
                )}
              </>
            ) : panel === "perfil" ? (
              <>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid oklch(0.93 0.005 255)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{nome}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 2 }}>{perfil}</div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    padding: "10px 12px",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "oklch(0.45 0.15 25)",
                  }}
                >
                  Sair
                </button>
              </>
            ) : panel === "favoritos" ? (
              <>
                <button type="button" onClick={salvarFavoritoAtual} style={{ ...resultLink, fontWeight: 700 } as React.CSSProperties}>
                  + Favoritar página atual
                </button>
                {favoritos.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
                    Nenhum favorito configurado.
                  </div>
                ) : (
                  favoritos.map((f) => (
                    <Link key={f.id} href={f.href} onClick={() => setPanel(null)} style={resultLink}>
                      {f.label}
                    </Link>
                  ))
                )}
              </>
            ) : panel === "recentes" ? (
              recentes.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
                  Nenhum item recente.
                </div>
              ) : (
                recentes.map((r) => (
                  <ResultBtn key={r.id} onClick={() => abrirRecente(r)}>
                    <strong>{r.label}</strong>
                    <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>{r.hint}</div>
                  </ResultBtn>
                ))
              )
            ) : (
              <>
                {notifs && notifs.items.length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
                    Nenhuma notificação.
                  </div>
                )}
                {(notifs?.items ?? []).map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setPanel(null)}
                    style={{
                      ...resultLink,
                      borderLeft: `3px solid ${
                        n.severidade === "danger"
                          ? "oklch(0.55 0.18 25)"
                          : n.severidade === "warning"
                            ? "oklch(0.75 0.14 85)"
                            : "oklch(0.55 0.16 255)"
                      }`,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.titulo}</div>
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 2 }}>{n.detalhe}</div>
                  </Link>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          padding: "6px 10px",
          fontSize: 10.5,
          fontWeight: 700,
          color: "oklch(0.5 0.02 250)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        background: "transparent",
        padding: "8px 10px",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "oklch(0.97 0.01 250)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

const resultLink: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  borderRadius: 7,
  fontSize: 13,
  color: "oklch(0.3 0.02 250)",
  textDecoration: "none",
};
