import type { DirectorDashboard, GroupDashboard } from "./dashboard.ts";
import type { PublicationCheck } from "./domain.ts";

export interface ReportSynthesis {
  perception: string;
  strength: string;
  attention: string;
}

export interface FeedbackReport {
  version: number;
  state: PublicationCheck["state"];
  issuedAt: string;
  director: string;
  cycle: string | null;
  unit: string | null;
  groups: Record<string, GroupDashboard>;
  syntheses: Record<string, ReportSynthesis | null>;
  methodology: {
    scale: { min: number; max: number };
    disclosureThreshold: number;
    notes: string[];
  };
}

export function buildFeedbackReport(
  dashboard: DirectorDashboard,
  publication: PublicationCheck,
  syntheses: Record<string, ReportSynthesis | null> = {},
  issuedAt = new Date().toISOString(),
  version = 1,
): FeedbackReport {
  const groups = Object.fromEntries(
    Object.entries(dashboard.groups).map(([group, summary]) => [group, summary]),
  );
  const allIndicators = Object.values(dashboard.groups).map((group) => group.overall);
  const firstIndicator = allIndicators[0];
  const disclosureThreshold = firstIndicator?.disclosureThreshold ?? 1;
  return {
    version,
    state: publication.state,
    issuedAt,
    director: dashboard.director,
    cycle: dashboard.cycle,
    unit: dashboard.unit,
    groups,
    syntheses,
    methodology: {
      scale: firstIndicator?.scale ?? { min: 1, max: 5 },
      disclosureThreshold,
      notes: [
        "Somente respostas válidas entram nos indicadores.",
        disclosureThreshold > 1
          ? "Contagens abaixo do limite de confidencialidade não são divulgadas."
          : "Médias calculadas a partir de todas as respostas válidas disponíveis, sem exigência de quantidade mínima de respostas.",
        ...publication.blockers,
        ...publication.warnings,
      ],
    },
  };
}
