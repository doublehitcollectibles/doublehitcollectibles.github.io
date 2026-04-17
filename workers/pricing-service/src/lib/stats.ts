import type { PricingMetrics, SoldComp } from "../types";

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function trimmedMean(values: number[]): number {
  if (values.length <= 2) {
    return average(values);
  }

  const sorted = [...values].sort((left, right) => left - right);
  const trimCount = Math.min(2, Math.floor(sorted.length * 0.1));
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return average(trimmed);
}

export function computePricingMetrics(comps: SoldComp[]): PricingMetrics {
  const prices = comps.map((comp) => comp.totalPrice).filter((value) => value > 0);
  const soldDates = comps.map((comp) => comp.soldAt).filter(Boolean) as string[];
  const sortedDates = [...soldDates].sort();
  const averagePrice = average(prices);
  const medianPrice = median(prices);

  return {
    marketPrice: medianPrice,
    averagePrice,
    medianPrice,
    trimmedMeanPrice: trimmedMean(prices),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    sampleSize: prices.length,
    soldFrom: sortedDates[0] ?? null,
    soldTo: sortedDates.at(-1) ?? null,
  };
}
