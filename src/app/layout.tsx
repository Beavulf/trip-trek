import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TripTrek — путешествия с друзьями",
  description: "Планируй путешествия с друзьями: маршрут, карта, бюджет, дневник. Совместное планирование в реальном времени.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TripTrek",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover" as const,
  // Клавиатура сжимает layout-вьюпорт: композер чата поднимается над ней (Android)
  interactiveWidget: "resizes-content" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Leaflet CSS импортируется внутри клиентских map-компонентов (trip-map, map-picker-client),
    // чтобы не быть render-blocking для страниц без карты (глобальный <link> с unpkg стоил ~760ms на мобильном LCP)
    <html lang="ru" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 5000,
            classNames: {
              toast: "!rounded-xl !border !border-border !bg-card !text-card-foreground !p-0 !min-h-[50px]",
              description: "!text-muted-foreground",
              actionButton: "!bg-primary !text-primary-foreground",
              cancelButton: "!bg-muted !text-muted-foreground",
            },
          }}
          closeButton
        />
      </body>
    </html>
  );
}
