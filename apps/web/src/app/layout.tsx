import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSw } from "@/components/RegisterSw";

export const metadata: Metadata = {
  title: "Nexo — Engenharia Clínica",
  description: "Gestão de Engenharia Clínica hospitalar",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Nexo Campo",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png" }],
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
      <body>
        <RegisterSw />
        {children}
      </body>
    </html>
  );
}
