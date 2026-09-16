"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EquipamentoNovoOverlay } from "@/components/equipamentos/EquipamentoNovoDialog";

export default function NovoEquipamentoPage() {
  return (
    <Suspense fallback={<div style={{ color: "#777", fontSize: 13 }}>Carregando…</div>}>
      <NovoInner />
    </Suspense>
  );
}

function NovoInner() {
  const router = useRouter();
  const search = useSearchParams();
  const multiplos = search.get("multiplos") === "1";

  return (
    <EquipamentoNovoOverlay
      multiplos={multiplos}
      onClose={() => router.push("/equipamentos")}
      onCreated={(tag, continuar) => {
        if (continuar) return;
        if (tag) router.push(`/equipamentos/${encodeURIComponent(tag)}`);
        else router.push("/equipamentos");
      }}
    />
  );
}
