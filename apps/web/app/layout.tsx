import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
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
        <div className="mx-auto w-full max-w-6xl px-6 pt-6">
          <SiteHeader />
        </div>
        {props.children}
      </body>
    </html>
  );
}
