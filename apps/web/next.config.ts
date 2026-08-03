import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sem standalone: no Railway/Railpack o `next start` com node_modules completo é mais confiável.
  transpilePackages: ["@nexo/shared"],
  // Domínios atrás do proxy (Railway / custom domain).
  serverActions: {
    allowedOrigins: ["hef.aion.eng.br", "localhost:3000"],
  },
};

export default nextConfig;
