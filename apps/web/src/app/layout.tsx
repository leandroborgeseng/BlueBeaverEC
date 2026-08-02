import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexo — Engenharia Clínica",
  description: "Gestão de Engenharia Clínica hospitalar",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Nexo Campo",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f4f9a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
