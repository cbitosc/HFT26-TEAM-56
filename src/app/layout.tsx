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

/** Display face for the landing page: ultra condensed and black, with tall caps. */
const robotoFlex = Roboto_Flex({
  variable: "--font-roboto-flex",
  subsets: ["latin"],
  axes: ["wdth", "YTUC"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Absolute base for share-image URLs. Set NEXT_PUBLIC_SITE_URL to override;
 * on Vercel the production domain is picked up automatically.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // App pages set full titles of their own ("Dashboard · vetted."), so no template.
  title: "vetted. Prove what you can build.",
  description:
    "Personalised coding assessments, written from the projects you've actually built.",
  openGraph: {
    title: "vetted. Prove what you can build.",
    description:
      "Personalised coding assessments, written from the projects you've actually built.",
    siteName: "vetted.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${robotoFlex.variable} h-full antialiased`}
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
