import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agora — Open Data Intelligence",
    template: "%s | Agora",
  },
  description:
    "Quality scores for open government data portals worldwide. Automated analysis of accessibility, structure, freshness, and completeness.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Agora — Open Data Intelligence",
    description:
      "Automated quality analysis of government open data portals. Accessibility, structure, freshness, and completeness scores for catalogs worldwide.",
    type: "website",
    locale: "en_US",
    siteName: "Agora",
  },
  twitter: {
    card: "summary",
    title: "Agora — Open Data Intelligence",
    description:
      "Automated quality scores for government open data portals worldwide.",
  },
  metadataBase: new URL("https://agora-open-data.vercel.app"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Header />
        <main className="min-h-[calc(100vh-8rem)]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2 font-semibold text-brand-700">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="text-brand-600"
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Agora
        </a>
        <nav className="flex items-center gap-6 text-sm">
          <a
            href="/ranking"
            className="text-slate-600 transition-colors hover:text-brand-700"
          >
            Ranking
          </a>
          <a
            href="https://github.com/idemfede/agora"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 transition-colors hover:text-brand-700"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500">
        Agora — Open Data Intelligence. Automated quality analysis of government open data portals.
      </div>
    </footer>
  );
}
