import { type ReactNode, Suspense } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";
import { QueryProvider } from "@/components/query-provider";
import type { Metadata } from "next";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Apex Assistant",
  description: "Apex Assistant tracker dashboard",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }]
  }
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable)}>
      <body className="min-h-full antialiased">
        <QueryProvider>
          <div className="mx-auto w-full max-w-6xl px-6 pt-6">
            <Suspense fallback={<SiteHeaderFallback />}>
              <SiteHeader />
            </Suspense>
          </div>
          {props.children}
        </QueryProvider>
      </body>
    </html>
  );
}
