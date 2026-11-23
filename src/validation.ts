import type {
  AssessmentImport,
  PublicationCheck,
  PublicationState,
} from "./domain.ts";

export interface InstitutionalDecisions {
  meanRuleApproved: boolean;
  confidentialityThresholdApproved: boolean;
  questionClassificationApproved: boolean;
  reviewersAssigned: boolean;
}

export function checkPublication(
  assessment: AssessmentImport,
  decisions: InstitutionalDecisions,
): PublicationCheck {
  const blockers = assessment.issues
    .filter((entry) => entry.severity === "erro")
    .map((entry) => entry.message);
  const warnings = assessment.issues
    .filter((entry) => entry.severity === "alerta")
    .map((entry) => entry.message);

  if (!decisions.reviewersAssigned) {
    blockers.push("Responsáveis pela revisão e aprovação ainda não foram definidos.");
  }
  if (!decisions.meanRuleApproved) {
    blockers.push("A regra oficial de cálculo das médias ainda não foi aprovada.");
  }
  if (!decisions.confidentialityThresholdApproved) {
    blockers.push("O limite institucional para grupos pequenos ainda não foi aprovado.");
  }
  if (!decisions.questionClassificationApproved) {
    warnings.push("As dimensões temáticas ainda não estão validadas.");
  }

  let state: PublicationState = "preliminar";
  if (blockers.length > 0) {
    state = assessment.status === "bloqueada" ? "bloqueada" : "em_revisao";
  } else if (
    decisions.meanRuleApproved &&
    decisions.confidentialityThresholdApproved &&
    decisions.reviewersAssigned
  ) {
    state = "aprovada";
  }
  return { state, blockers, warnings };
}
