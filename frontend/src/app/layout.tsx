import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Leaf } from "lucide-react";
import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "WasteLess", template: "%s · WasteLess" },
  description: "AI demand forecasting to cut restaurant food waste.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-muted/30">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="no-print flex flex-col gap-4 border-b bg-background p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0">
            <div className="flex items-center gap-2 px-1">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Leaf className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold leading-tight">WasteLess</div>
                <div className="text-[11px] text-muted-foreground">Forecasting &amp; planning</div>
              </div>
            </div>
            <Suspense fallback={null}>
              <Nav />
            </Suspense>
            <div className="mt-auto hidden text-[11px] text-muted-foreground md:block">
              Modules E · F · J — Himanshu
            </div>
          </aside>
          <main className="flex-1 p-4 md:p-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
