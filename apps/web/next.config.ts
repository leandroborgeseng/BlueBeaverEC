import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sem standalone: no Railway/Railpack o `next start` com node_modules completo é mais confiável.
  transpilePackages: ["@aion/shared"],
  // /api/* no browser é same-origin. O proxy server-side está em
  // src/app/api/[...path]/route.ts (API_INTERNAL_URL). Rewrite aqui perderia
  // para o Route Handler; NEXT_PUBLIC_API_URL vazio = não expor *.railway.internal.
};

export default nextConfig;
