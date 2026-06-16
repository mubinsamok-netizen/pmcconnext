import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/Providers";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const kanit = Kanit({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-kanit",
});

export const metadata: Metadata = {
  title: "PMC CONNEXT",
  description: "Construction Operations Platform",
};

const themeScript = `
  (() => {
    try {
      const stored = window.localStorage.getItem("pmc_theme");
      const theme = stored === "dark" || stored === "light"
        ? stored
        : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;
    } catch {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className={`${kanit.className} min-h-full flex flex-col`}>
        <Script
          id="pmc-theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
