import type { Metadata } from "next";
import "./globals.css";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "TVPHI — Historias narradas",
  description:
    "Crea historias narradas con IA: texto, imágenes, voz y exportación en el navegador.",
  metadataBase: new URL(env.appUrl),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
