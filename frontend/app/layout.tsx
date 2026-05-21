import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { AppToaster } from "@/components/feedback";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ILD-XR",
  description: "AI-powered lung disease analysis platform with WebXR visualization.",
  icons: {
    icon: "/assets/logo.png",
  },
  other: {
    google: "notranslate",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased notranslate`}
      >
        <ThemeProvider>
          <Providers>{children}</Providers>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
