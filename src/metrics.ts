import type { IndicatorResult } from "./domain.ts";

export interface IndicatorOptions {
  minimum: number;
  scaleMin: number;
  scaleMax: number;
  decimals: number;
}

const defaultOptions: IndicatorOptions = {
  minimum: 1,
  scaleMin: 1,
  scaleMax: 5,
  decimals: 2,
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateIndicator(
  values: readonly unknown[],
  options: Partial<IndicatorOptions> = {},
): IndicatorResult {
  const config = { ...defaultOptions, ...options };
  if (!Number.isInteger(config.minimum) || config.minimum < 1) {
    throw new Error("O limite mínimo de divulgação deve ser um inteiro positivo.");
  }
  if (config.scaleMin >= config.scaleMax) {
    throw new Error("A escala deve possuir limite mínimo menor que o máximo.");
  }
  if (!Number.isInteger(config.decimals) || config.decimals < 0) {
    throw new Error("A quantidade de casas decimais deve ser um inteiro não negativo.");
  }

  const validValues = values.filter(
    (value): value is number =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= config.scaleMin &&
      value <= config.scaleMax,
  );
  const disclosed = validValues.length >= config.minimum;
  if (!disclosed) {
    return {
      validCount: validValues.length,
      mean: null,
      scale: { min: config.scaleMin, max: config.scaleMax },
      disclosed: false,
      disclosureThreshold: config.minimum,
      note:
        config.minimum <= 1
          ? "Indicador indisponível: não há respostas válidas."
          : `Indicador indisponível: são necessárias pelo menos ${config.minimum} respostas válidas.`,
    };
  }

  const mean = validValues.reduce((total, value) => total + value, 0) / validValues.length;
  return {
    validCount: validValues.length,
    mean: round(mean, config.decimals),
    scale: { min: config.scaleMin, max: config.scaleMax },
    disclosed: true,
    disclosureThreshold: config.minimum,
    note: null,
  };
}
