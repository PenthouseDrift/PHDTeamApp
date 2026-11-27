import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SessionProvider } from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { PushNotificationSubscriber } from "@/components/PushNotificationSubscriber";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallBanner } from "@/components/InstallBanner";
import { DriftWheelIntro } from "@/components/ui/DriftWheelIntro";
import { isDriftClashHost } from "@/lib/app-host";
import { baseViewport, gameViewport } from "@/lib/viewport";
import { NoPinchZoom } from "@/components/NoPinchZoom";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The same deployment serves the full Penthouse Drift app and the game-only Drift Clash app
// (see lib/app-host.ts), so the name shown in tabs and on the home screen depends on the host.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const driftClash = isDriftClashHost(h.get("x-forwarded-host") ?? h.get("host"));
  return {
    title: driftClash ? "Drift Clash" : "Penthouse Drift",
    description: driftClash
      ? "Drift Clash: collect RC drift cards and take on other drivers"
      : "RC Drift Track Community Platform",
    icons: {
      icon: [
        { url: "/favicon.png", type: "image/png", sizes: "32x32" },
        { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      ],
      apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    },
    appleWebApp: {
      capable: true,
      // "default" keeps app content below the iOS status bar. "black-translucent"
      // extends the web view under the notch/clock, hiding the top of the UI
      // unless every top-level element carries safe-area-inset padding.
      statusBarStyle: "default",
      title: driftClash ? "Drift Clash" : "PHD",
    },
    other: {
      "mobile-web-app-capable": "yes",
    },
  };
}

// The game-only Drift Clash app can't be pinch-zoomed (it should feel like an app); the full Penthouse Drift site can, as before.
export async function generateViewport(): Promise<Viewport> {
  const h = await headers();
  return isDriftClashHost(h.get("x-forwarded-host") ?? h.get("host")) ? gameViewport : baseViewport;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const driftClash = isDriftClashHost(h.get("x-forwarded-host") ?? h.get("host"));
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The inline script below may add the "dark" class before React loads.
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before the first paint so the app doesn't flash light when reopened. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("phd-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <SessionProvider>
          <ThemeProvider>
            {driftClash && <NoPinchZoom />}
            <DriftWheelIntro autoPlayInitial={!driftClash} />
            <InstallBanner appName={driftClash ? "Drift Clash" : "Penthouse Drift"} />
            <ServiceWorkerRegister />
            <OfflineIndicator />
            {/* Push notifications are track news (events, winners), so the game-only app does not ask for them. */}
            {!driftClash && <PushNotificationSubscriber />}
            {children}
          </ThemeProvider>
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  );
}
