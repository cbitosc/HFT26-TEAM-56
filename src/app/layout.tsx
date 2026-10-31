import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { authHintScript } from "@/lib/auth-hint";
import { panelWidthScript } from "@/lib/layout";
import { themeScript } from "@/lib/theme";
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
  title: "vetted.",
  description:
    "Personalized technical assessments built from your portfolio, skills, and projects.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: panelWidthScript }} />
        <script dangerouslySetInnerHTML={{ __html: authHintScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
