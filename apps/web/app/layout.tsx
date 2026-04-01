import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Apex Assistant",
  description: "Apex Assistant tracker dashboard"
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable)}>
      <body className="min-h-full antialiased">{props.children}</body>
    </html>
  );
}
