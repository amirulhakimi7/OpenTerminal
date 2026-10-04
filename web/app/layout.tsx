import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Silkscreen, VT323 } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

// Self-hosted by next/font at build time; the browser never calls Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
// Pixel fonts for the trading floor: Silkscreen for signage, VT323 for LED text and speech.
const silkscreen = Silkscreen({ subsets: ["latin"], weight: "400", variable: "--font-pixel", display: "swap" });
const vt323 = VT323({ subsets: ["latin"], weight: "400", variable: "--font-vt", display: "swap" });

export const metadata: Metadata = {
  title: "OpenTerminal",
  description: "Multi-asset trading workspace on free data sources",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${silkscreen.variable} ${vt323.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
