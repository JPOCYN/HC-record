import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baby Record",
  description: "A private feeding, diaper, height, and weight tracker.",
  applicationName: "Baby Record",
  // On the Hub origin this resolves to the single Family Hub PWA manifest.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Baby Record",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/baby-assets/icon.svg",
    apple: "/baby-assets/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7efe9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
