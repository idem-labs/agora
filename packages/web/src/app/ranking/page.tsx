import { getCatalogs } from "@/lib/data";
import { RankingTable } from "./ranking-table";

export const metadata = {
  title: "Catalog Ranking",
  description: "Government open data portals ranked by quality score.",
};

export default async function RankingPage() {
  const catalogs = await getCatalogs();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Catalog Ranking</h1>
      <p className="mt-2 text-slate-500">
        {catalogs.length} government open data portals grouped by country.
        Ranked by quality score weighted by catalog size.
      </p>

      <RankingTable catalogs={catalogs} />
    </div>
  );
}
