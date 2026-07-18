import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { PushNotificationSubscriber } from "@/components/PushNotificationSubscriber";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Penthouse Drift",
  description: "RC Drift Track Community Platform",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PH Drift",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50">
        <SessionProvider>
          <ServiceWorkerRegister />
          <OfflineIndicator />
          <PushNotificationSubscriber />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
