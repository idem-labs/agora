import { getCatalogs } from "@/lib/data";
import { RankingTable } from "./ranking-table";

export const metadata = {
  title: "Catalog Ranking — Agora",
  description: "Government open data portals ranked by quality score.",
};

export default async function RankingPage() {
  const catalogs = await getCatalogs();
  const sorted = [...catalogs].sort((a, b) => b.scores.overall - a.scores.overall);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Catalog Ranking</h1>
      <p className="mt-2 text-slate-500">
        {catalogs.length} government open data portals ranked by automated quality analysis.
      </p>

      <RankingTable catalogs={sorted} />
    </div>
  );
}
