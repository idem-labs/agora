import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agora — An MCP server for government open data",
    template: "%s | Agora",
  },
  description:
    "MCP server connecting LLMs to 42 government data portals across 13 countries. Search datasets, run SQL on remote CSVs, and filter by quality score.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Agora — Government open data for your AI",
    description:
      "MCP server connecting LLMs to 42 government data portals across 13 countries. Search datasets, run SQL on remote CSVs, and filter by quality score.",
    type: "website",
    locale: "en_US",
    siteName: "Agora",
  },
  twitter: {
    card: "summary",
    title: "Agora — Government open data for your AI",
    description:
      "MCP server connecting LLMs to 42 government data portals. Search, SQL queries, and quality scores in one tool call.",
  },
  metadataBase: new URL("https://agora.idem-labs.workers.dev"),
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
            href="https://github.com/idem-labs/agora"
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
    <footer className="border-t border-slate-200 bg-white py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="text-sm text-slate-500">
            Agora &mdash; Open Data Intelligence
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="/ranking" className="transition hover:text-slate-900">Ranking</a>
            <a
              href="https://github.com/idem-labs/agora"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-slate-900"
            >
              GitHub
            </a>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Quality scoring pipeline for government open data portals.
          Multi-catalog MCP server for AI access to open data.
        </p>
      </div>
    </footer>
  );
}
