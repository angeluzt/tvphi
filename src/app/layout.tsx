import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TVPHI — Streaming en vivo, sin OBS",
  description:
    "Plataforma de streaming moderna: transmite desde el navegador con escenas, capas y alertas. Chat con moderación, puntos y donaciones.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
