import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Geist } from "next/font/google";

import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "./components/shell";
import { ToastProvider } from "./components/ui";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Visa Document Checker", template: "%s · Visa Document Checker" },
  description: "Pre-submission document checking for student visa applications.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(mono.variable, "font-sans", geist.variable)}>
      <body>
        <TooltipProvider delay={200}>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
