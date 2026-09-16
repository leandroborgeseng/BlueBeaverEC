"use client";

import { ConsolidarCadastroDialog } from "@/components/equipamentos/ConsolidarCadastroDialog";
import { Overlay } from "@/components/os/os-win-ui";
import { useRouter } from "next/navigation";

/** Atalho: a consolidação vive em Cadastros. */
export default function ConsolidarModelosPage() {
  const router = useRouter();
  return (
    <Overlay onClose={() => router.push("/cadastros?tab=modelos")} fixed>
      <ConsolidarCadastroDialog
        kind="modelos"
        onClose={() => router.push("/cadastros?tab=modelos")}
        onDone={() => router.push("/cadastros?tab=modelos")}
      />
    </Overlay>
  );
}
