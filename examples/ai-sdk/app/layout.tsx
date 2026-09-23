import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "TrustGuard × AI SDK",
  description: "A chat agent guarded by TrustGuard through @neuraltrust/trustguard-sdk/ai-sdk",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
