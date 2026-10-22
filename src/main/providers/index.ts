import type { Provider, ProviderState } from "@shared/types";
import { getKey } from "../secrets";
import { fetchRunpod } from "./runpod";
import { fetchVast } from "./vast";

const fetchers = { runpod: fetchRunpod, vast: fetchVast };

export async function listMachines(): Promise<ProviderState[]> {
  const providers: Provider[] = ["runpod", "vast"];
  return Promise.all(
    providers.map(async (provider): Promise<ProviderState> => {
      const { key, source } = getKey(provider);
      if (!key) return { provider, keySource: source, instances: [] };
      try {
        return { provider, keySource: source, ...(await fetchers[provider](key)) };
      } catch (err) {
        return { provider, keySource: source, instances: [], error: (err as Error).message };
      }
    }),
  );
}
