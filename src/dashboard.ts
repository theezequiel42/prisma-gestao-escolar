import type {
  AssessmentRecord,
  IndicatorResult,
  RespondentGroup,
} from "./domain.ts";
import { calculateIndicator } from "./metrics.ts";

export interface GroupDashboard {
  group: RespondentGroup;
  submissions: number;
  overall: IndicatorResult;
}

export interface DirectorDashboard {
  director: string;
  cycle: string | null;
  unit: string | null;
  groups: Record<RespondentGroup, GroupDashboard>;
}

const groups: RespondentGroup[] = [
  "professores",
  "funcionarios",
  "pais_responsaveis",
];

export function buildDirectorDashboard(
  records: readonly AssessmentRecord[],
  director: string,
  answerKey: string,
  minimumResponses = 5,
): DirectorDashboard {
  const selected = records.filter((record) => record.director === director);
  const first = selected[0];
  const result = Object.fromEntries(
    groups.map((group) => {
      const groupRecords = selected.filter((record) => record.group === group);
      return [
        group,
        {
          group,
          submissions: groupRecords.length,
          overall: calculateIndicator(
            groupRecords.map((record) => record.answers[answerKey]),
            { minimum: minimumResponses },
          ),
        },
      ];
    }),
  ) as Record<RespondentGroup, GroupDashboard>;
  return {
    director,
    cycle: first?.cycle ?? null,
    unit: first?.unit ?? null,
    groups: result,
  };
}
