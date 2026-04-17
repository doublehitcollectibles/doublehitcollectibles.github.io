import type { Env, NormalizedCardQuery, PricingConfig, ProviderSnapshot } from "../types";

export interface SoldPricingProvider {
  readonly key: string;
  fetchSnapshot(env: Env, query: NormalizedCardQuery, config: PricingConfig): Promise<ProviderSnapshot>;
}
