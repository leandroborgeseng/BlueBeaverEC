import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sem standalone: no Railway/Railpack o `next start` com node_modules completo é mais confiável.
  transpilePackages: ["@aion/shared"],
};

export default nextConfig;
