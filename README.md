# Avaliação de Diretores e Devolutivas

## Descrição do projeto

Este projeto apoia a Secretaria Municipal de Educação na transformação dos
resultados das avaliações de diretores em informações confiáveis,
compreensíveis e úteis para o desenvolvimento da gestão escolar. A solução
deverá permitir validar a base de avaliações, consultar resultados por diretor
e público respondente, revisar sínteses e gerar devolutivas individuais em PDF,
preservando a confidencialidade dos respondentes e a rastreabilidade dos
indicadores.

A primeira entrega corresponde à Etapa A definida no
[PRD de Avaliação de Diretores e Devolutivas](./PRD%20-%20Avalia%C3%A7%C3%A3o%20de%20Diretores%20e%20Devolutivas.md).
Ela utiliza a planilha unificada de 2026 como fonte de entrada e prepara a
evolução futura para persistência em banco de dados, perfis de acesso, novos
ciclos e histórico de avaliações.

## Estado atual

O incremento implementado:

- reconhece a aba de respostas e diferencia as abas auxiliares;
- reconcilia a base com 2.202 respostas, 27 diretores e 132 colunas;
- reconhece as 230 entradas da aba oficial “Mapa das perguntas”, preservando
  lote, colunas de origem/unificada, bloco e cabeçalho;
- identifica grupos de perguntas e a coluna do diretor avaliado;
- calcula indicadores apenas com valores válidos da escala de 1 a 5;
- informa o denominador e calcula as médias para todos os diretores com respostas
  válidas, independentemente de uma quantidade mínima de respostas;
- monta um resumo de dashboard por diretor com os três públicos;
- controla bloqueios para publicação oficial enquanto decisões institucionais
  não estiverem aprovadas;
- cria um modelo versionado de devolutiva, mantendo recorte, indicadores e
  metodologia alinhados ao dashboard;
- permite criar, revisar, devolver e aprovar versões de sínteses por público;
- sinaliza bases bloqueadas ou em revisão, sem publicar resultados oficiais;
- preserva a origem dos dados e não deduplica respostas sem decisão institucional;
- evita interpretar comentários e desenhos XML da planilha como dados.

Ainda não estão implementados o dashboard, a revisão de sínteses, a geração de
PDFs e a persistência completa em banco. Esses itens fazem parte das próximas
etapas do produto.

## Executar

```bash
npm install
npm test
npm run inspect:base -- avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx
npm run build && npm start -- avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx
```

O comando de inspeção produz JSON com a aba reconhecida, quantidade de
respostas, diretores, colunas agrupadas, abas auxiliares e pendências. Uma base
com erro fica `bloqueada`; uma base reconhecida permanece `em_revisao` até a
validação institucional.

O comando `start` inicia um dashboard local em `http://localhost:3000`, com
seleção de diretor e cartões para professores, funcionários e
pais/responsáveis. Ele é uma prévia em revisão, não um portal autenticado nem
uma publicação oficial. A rota `/report.pdf?director=...` gera uma devolutiva
individual preliminar usando o mesmo recorte do dashboard; ela não envia o
arquivo nem libera resultados oficiais.

O dashboard também apresenta formulários para criar rascunhos das três
sínteses por público e mostra a última versão persistida de cada uma.
Versões em rascunho podem ser aprovadas ou devolvidas para ajustes com uma
observação obrigatória.

## Geração das sínteses por IA

As sínteses podem ser geradas pelo dashboard a partir somente dos agregados do
diretor e do público. O texto não é publicado automaticamente: todo rascunho
gerado por IA pode ser revisado e aprovado ou devolvido pela equipe.

A integração usa OpenAI ou um endpoint compatível por variáveis de ambiente:

```bash
OPENAI_API_KEY="..." \
OPENAI_MODEL="gpt-4o-mini" \
OPENAI_BASE_URL="https://api.openai.com/v1" \
npm start -- avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx
```

Para Azure OpenAI, configure `AI_PROVIDER=azure`, `AI_API_KEY`, `AI_ENDPOINT`,
`AI_DEPLOYMENT` e opcionalmente `AI_API_VERSION`.

Para Google Gemini, use:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY="..."
AI_MODEL=gemini-2.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
```

Também é possível usar `GOOGLE_API_KEY` no lugar de `GEMINI_API_KEY`.

Para uso local seguro, copie `.env.example` para `.env` e preencha os valores:

```bash
cp .env.example .env
```

O arquivo `.env` já está ignorado pelo Git e não deve ser enviado em commits,
mensagens ou capturas de tela. Não use uma chave no código-fonte ou em
`NEXT_PUBLIC_*`/variáveis acessíveis ao navegador. Reinicie o projeto após
alterar o arquivo.

Sem credenciais configuradas, `POST /api/syntheses/generate` informa claramente
que a IA não está disponível. Nenhum texto é fabricado como substituto do
provedor.

A API local também disponibiliza `/api/directors` e
`/api/dashboard?director=...`, permitindo que uma futura interface web consuma
os dados sem repetir os cálculos de indicadores.

O fluxo de sínteses usa armazenamento local em `.data/syntheses.json` (ou no
caminho definido por `SYNTHESIS_STORE`) e oferece `POST /api/syntheses` para
criação, `GET /api/syntheses?director=...&group=...` para consulta e
`POST /api/syntheses/review` para aprovar ou devolver uma versão.

Este incremento ainda não publica resultados oficiais, não deduplica respostas
e não presume equivalência entre perguntas pela posição ou pelo texto. O leitor
remove apenas referências XML de comentários da cópia em memória antes de
processar a planilha, evitando que anotações e desenhos de comentários sejam
interpretados como dados.
