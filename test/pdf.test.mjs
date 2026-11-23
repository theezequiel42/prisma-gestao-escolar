import test from "node:test";
import assert from "node:assert/strict";
import { renderFeedbackPdf } from "../dist/pdf.js";

test("gera PDF preliminar sem falhar quando há grupos protegidos", async () => {
  const pdf = await renderFeedbackPdf({
    version: 1,
    state: "em_revisao",
    issuedAt: "2026-01-01T00:00:00.000Z",
    director: "Diretora A",
    cycle: "2026",
    unit: null,
    groups: {
      professores: {
        group: "professores",
        submissions: 1,
        overall: {
          validCount: 1,
          mean: null,
          scale: { min: 1, max: 5 },
          disclosed: false,
          disclosureThreshold: 5,
          note: "Indicador indisponível.",
        },
      },
    },
    syntheses: {},
    methodology: {
      scale: { min: 1, max: 5 },
      disclosureThreshold: 5,
      notes: ["Documento preliminar."],
    },
  });

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 500);
});

test("gera PDF visual completo com sínteses e destaques por público", async () => {
  const pdf = await renderFeedbackPdf({
    version: 2,
    state: "aprovada",
    issuedAt: "2026-11-23T17:00:00.000Z",
    director: "Cristiane de Andrade",
    cycle: "2026",
    unit: "CEI Liberata",
    groups: {
      professores: {
        group: "professores",
        submissions: 6,
        overall: {
          validCount: 216,
          mean: 4.24,
          scale: { min: 1, max: 5 },
          disclosed: true,
          disclosureThreshold: 1,
          note: null,
        },
        questions: [
          { question: "1. Trabalho em parceria com os professores", mean: 4.67, validCount: 6 },
          { question: "2. Participação da comunidade no PPP", mean: 3.83, validCount: 6 },
        ],
      },
      funcionarios: {
        group: "funcionarios",
        submissions: 6,
        overall: {
          validCount: 108,
          mean: 4.36,
          scale: { min: 1, max: 5 },
          disclosed: true,
          disclosureThreshold: 1,
          note: null,
        },
        questions: [
          { question: "1. Clareza e objetividade na comunicação", mean: 4.67, validCount: 6 },
          { question: "2. Resolução de problemas inesperados", mean: 4.0, validCount: 6 },
        ],
      },
      pais_responsaveis: {
        group: "pais_responsaveis",
        submissions: 28,
        overall: {
          validCount: 280,
          mean: 4.63,
          scale: { min: 1, max: 5 },
          disclosed: true,
          disclosureThreshold: 1,
          note: null,
        },
        questions: [
          { question: "1. Tratamento respeitoso às famílias", mean: 4.82, validCount: 28 },
          { question: "2. Comunicação e escuta de dúvidas", mean: 4.54, validCount: 28 },
        ],
      },
    },
    syntheses: {
      professores: {
        perception: "Os professores avaliam a gestão de forma positiva no dia a dia.",
        strength: "Destaca-se a parceria no apoio ao desenvolvimento das crianças.",
        attention: "Vale ampliar os momentos de conversa coletiva sobre o PPP.",
      },
      funcionarios: null,
      pais_responsaveis: {
        perception: "As famílias demonstram grande confiança no trabalho da direção.",
        strength: "O respeito e a atenção no acolhimento foram os pontos mais elogiados.",
        attention: "Seguir fortalecendo a escuta ativa de dúvidas e sugestões.",
      },
    },
    methodology: {
      scale: { min: 1, max: 5 },
      disclosureThreshold: 1,
      notes: ["Somente respostas válidas entram nos indicadores."],
    },
  });

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 2000);
});
