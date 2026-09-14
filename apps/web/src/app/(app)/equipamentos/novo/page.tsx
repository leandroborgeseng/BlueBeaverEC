"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { LABEL_PROPRIEDADE, type PropriedadeEquipamento } from "@aion/shared";
import { Btn, Err, FieldLabel, PageHeader, Surface, fieldStyle } from "@/components/ui/aion-ui";

interface Lookup {
  id: string;
  nome: string;
}

export default function NovoEquipamentoPage() {
  const router = useRouter();
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [planos, setPlanos] = useState<Lookup[]>([]);
  const [fabricantes, setFabricantes] = useState<Lookup[]>([]);
  const [modelos, setModelos] = useState<Lookup[]>([]);
  const [proxima, setProxima] = useState("HEF-····");
  const [fabricanteId, setFabricanteId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<Lookup[]>("/setores"),
      api<Lookup[]>("/planos-descricao"),
      api<Lookup[]>("/fabricantes"),
      api<{ tag: string }>("/equipamentos/proxima-tag"),
    ]).then(([s, p, f, t]) => {
      setSetores(s);
      setPlanos(p);
      setFabricantes(f);
      setProxima(t.tag);
    });
  }, []);

  useEffect(() => {
    if (!fabricanteId) {
      setModelos([]);
      return;
    }
    api<Lookup[]>(`/modelos?fabricanteId=${encodeURIComponent(fabricanteId)}`)
      .then(setModelos)
      .catch(() => setModelos([]));
  }, [fabricanteId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      nome: String(fd.get("nome") ?? "").trim(),
      setorId: String(fd.get("setorId") ?? ""),
      descricaoId: String(fd.get("descricaoId") ?? "") || undefined,
      fabricanteId: String(fd.get("fabricanteId") ?? "") || undefined,
      modeloId: String(fd.get("modeloId") ?? "") || undefined,
      patrimonio: String(fd.get("patrimonio") ?? "").trim() || undefined,
      nSerie: String(fd.get("nSerie") ?? "").trim() || undefined,
      idInterna: String(fd.get("idInterna") ?? "").trim() || undefined,
      unidade: String(fd.get("unidade") ?? "").trim() || undefined,
      localizacaoFisica: String(fd.get("localizacaoFisica") ?? "").trim() || undefined,
      propriedade: (String(fd.get("propriedade") ?? "PROPRIO") || "PROPRIO") as PropriedadeEquipamento,
      propriedadeOutra: String(fd.get("propriedadeOutra") ?? "").trim() || undefined,
    };
    try {
      const created = await api<{ tag: string }>("/equipamentos", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/equipamentos/${encodeURIComponent(created.tag)}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="Novo equipamento"
        subtitle={`Cadastro mínimo: nome e setor. TAG sugerida ${proxima}. O restante pode ser completado depois.`}
      />
      <Surface>
        <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12 }}>
          <div>
            <FieldLabel>Nome *</FieldLabel>
            <input name="nome" required placeholder="Ex.: Monitor multiparamétrico" style={fieldStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Setor responsável *</FieldLabel>
              <select name="setorId" required style={fieldStyle}>
                <option value="">Selecione…</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Tipo</FieldLabel>
              <select name="descricaoId" style={fieldStyle}>
                <option value="">Outros (completar depois)</option>
                {planos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Patrimônio</FieldLabel>
              <input name="patrimonio" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Nº série</FieldLabel>
              <input name="nSerie" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>ID interna</FieldLabel>
              <input name="idInterna" style={fieldStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Fabricante</FieldLabel>
              <select
                name="fabricanteId"
                value={fabricanteId}
                onChange={(e) => setFabricanteId(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Não informado</option>
                {fabricantes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Modelo</FieldLabel>
              <select name="modeloId" disabled={!fabricanteId} style={fieldStyle}>
                <option value="">Não informado</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Unidade</FieldLabel>
              <input name="unidade" placeholder="Hospital / prédio" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Localização física</FieldLabel>
              <input name="localizacaoFisica" placeholder="Sala, leito…" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Propriedade</FieldLabel>
              <select name="propriedade" defaultValue="PROPRIO" style={fieldStyle}>
                {(Object.keys(LABEL_PROPRIEDADE) as PropriedadeEquipamento[]).map((k) => (
                  <option key={k} value={k}>
                    {LABEL_PROPRIEDADE[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <FieldLabel>Se for outra classificação, descreva</FieldLabel>
            <input name="propriedadeOutra" placeholder="Ex.: cessão, parceria…" style={fieldStyle} />
          </div>
          {erro && <Err>{erro}</Err>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn type="submit" disabled={busy}>
              {busy ? "Salvando…" : `Cadastrar (${proxima})`}
            </Btn>
            <Btn type="button" variant="ghost" href="/equipamentos">
              Cancelar
            </Btn>
          </div>
        </form>
      </Surface>
    </div>
  );
}
