"use client";

import { Suspense } from "react";
import MobileQrInner from "./qr-inner";

export default function MobileQrPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, textAlign: "center", color: "oklch(0.5 0.02 250)" }}>Carregando QR…</div>
      }
    >
      <MobileQrInner />
    </Suspense>
  );
}
