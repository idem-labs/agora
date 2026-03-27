import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

const instances = new Map<string, DuckDBInstance>();

/**
 * Open (or reuse) a DuckDB database at the given file path.
 * Each unique path gets a single shared instance.
 */
export async function openDatabase(path: string): Promise<DuckDBInstance> {
  let inst = instances.get(path);
  if (!inst) {
    inst = await DuckDBInstance.create(path);
    instances.set(path, inst);
  }
  return inst;
}

/** Create a new connection on the given database file. */
export async function connectDatabase(
  path: string,
): Promise<DuckDBConnection> {
  const inst = await openDatabase(path);
  return inst.connect();
}

/** Close all open DuckDB instances. Call on shutdown. */
export function closeAllDatabases(): void {
  for (const inst of instances.values()) {
    try {
      inst.closeSync();
    } catch {
      // ignore — may already be closed
    }
  }
  instances.clear();
}
