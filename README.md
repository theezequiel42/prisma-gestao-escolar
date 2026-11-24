# Avaliação de Diretores e Devolutivas — Fraiburgo

## Descrição do projeto

Este projeto apoia a **Secretaria Municipal de Educação de Fraiburgo** na transformação dos resultados das avaliações de diretores escolares em indicadores confiáveis, sínteses em linguagem simples e devolutivas individuais em PDF.

A entrega atual corresponde à **Etapa A** definida no [PRD de Avaliação de Diretores e Devolutivas](./PRD%20-%20Avalia%C3%A7%C3%A3o%20de%20Diretores%20e%20Devolutivas.md). A aplicação consome a planilha unificada de 2026 em uma **interface interna unificada** (sem perfis separados de acesso nem fluxo de devolução para ajustes): a própria equipe consulta os resultados, gera ou ajusta as sínteses diretamente na tela, aprova e baixa os PDFs de devolutiva para encaminhamento externo aos diretores.

## O que está implementado

- **Importação e auditoria da planilha (`.xlsx`):**
  - reconhece a aba de respostas e diferencia abas auxiliares (*Origem das linhas* e *Mapa das perguntas*);
  - reconcilia a base de 2026 com **2.202 respostas**, **27 diretores**, **132 colunas** e **230 entradas** no *Mapa das perguntas*;
  - usa a coluna oficial `Qual o seu perfil?` e os blocos do *Mapa das perguntas* (`Docentes`, `Funcionários` e `Famílias`) para cobrir todos os lotes (Anos Iniciais, Anos Finais e Educação Infantil);
  - remove referências XML de comentários/desenhos apenas na cópia em memória antes de ler o arquivo, evitando que anotações sejam interpretadas como dados;
  - não deduplica respostas automaticamente e não presume equivalência entre perguntas pela posição.
- **Indicadores e cálculo de médias:**
  - calcula médias apenas com valores válidos da escala **1 a 5** (vazios e inválidos não viram zero);
  - calcula médias gerais e por pergunta para **todos os 27 diretores e os três públicos** (`professores`, `funcionarios` e `pais_responsaveis`), independentemente de um número mínimo de respostas.
- **Dashboard web unificado (`http://localhost:3000`):**
  - estilizado com a **identidade visual oficial de Fraiburgo — Terra da Maçã** ([assets/logotipo.png](./assets/logotipo.png) e paleta cromática oficial);
  - seleção de diretor(a) com cartões temáticos para **Professores**, **Funcionários** e **Pais / Responsáveis**;
  - botão único **"Gerar síntese por IA"** para gerar, em uma ação, as sínteses dos três públicos do diretor selecionado;
  - edição direta e aprovação das sínteses na mesma tela (sem recarregar a página e sem perder edições em andamento nos demais cartões), com indicador de progresso por diretor no seletor e versionamento atômico persistido em `.data/syntheses.json`;
  - botões **"Baixar devolutiva (PDF)"** (individual) e **"Baixar todos (ZIP)"** (lote completo dos 27 diretores).
- **Geração de sínteses por IA em linguagem simples:**
  - envia à IA os dados agregados e os temas das perguntas mais bem avaliadas e menos bem avaliadas de cada público;
  - produz textos curtos, respeitosos e cotidianos sobre as impressões a respeito do(a) diretor(a) (*Impressão geral*, *Ponto forte* e *Aspecto de atenção*), sem jargões estatísticos.
- **Devolutiva individual em PDF (A4 paisagem):**
  - layout institucional de 1 página com o logotipo oficial de Fraiburgo no topo branco, paleta oficial (*Inverno*, *Verão*, *Primavera*, *Outono* e *Maçã*), cartões com médias e estrelas proporcionais, painel de sínteses/destaques por público e nota metodológica;
  - estruturado **sem repetição de informações** (cada média aparece uma única vez, sem tabelas ou gráficos redundantes nem blocos duplicados de conclusão).

### Próximas etapas (Etapas B e C do PRD)

- Persistência em banco de dados relacional com cadastros de pessoas, unidades, perguntas, questionários e ciclos avaliativos.
- Classificação validada de perguntas por dimensões temáticas e exportação de PDFs em lote.
- Acompanhamento histórico entre ciclos avaliativos, mantendo o uso interno unificado e encaminhamento externo das devolutivas.

## Identidade visual (Fraiburgo — Terra da Maçã)

Tanto a interface web quanto o PDF de devolutiva utilizam o logotipo em [assets/logotipo.png](./assets/logotipo.png) e as cores oficiais da paleta cromática de Fraiburgo:

| Cor | HEX | Uso principal |
|---|---|---|
| **Inverno** | `#4E2412` | Títulos, cabeçalhos de seção, botão de IA e rodapé metodológico |
| **Verão** | `#A72B2A` | Destaque institucional, público **Professores** e botão de PDF |
| **Primavera** | `#587E3C` | Público **Funcionários**, ícones de **Ponto Forte** e aprovação |
| **Outono** | `#DF7835` | Público **Pais / Responsáveis**, estrelas e **Aspecto de Atenção** |
| **Maçã** | `#F0EDC5` | Faixas de aviso, subtítulos sobre fundo escuro e fundos claros quentes |

## Como executar

```bash
npm install
npm test
npm run inspect:base -- avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx
npm run build && npm start -- avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx
```

- `npm test` — compila o TypeScript (`tsc`) e executa a suíte de testes (`node --test`).
- `npm run inspect:base -- <arquivo.xlsx>` — inspeciona a planilha e retorna JSON com abas reconhecidas, contagens, mapa de perguntas, pendências e status (`em_revisao` ou `bloqueada`).
- `npm start` — inicia o servidor local em `http://127.0.0.1:3000` (configurável por `HOST` e `PORT`), carregando automaticamente `.env` quando presente (a planilha `avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx` é usada como padrão caso nenhum arquivo seja passado como argumento).

## Administração na Vercel

- O painel público é somente para consulta. Rascunhos e histórico de sínteses ficam na área administrativa, em `/admin/`, inclusive os PDFs que incluem sínteses.
- Vincule um PostgreSQL Neon ao ambiente Production para fornecer `DATABASE_URL`. Para proteger a área administrativa, configure `ADMIN_PASSWORD` como variável sensível, com uma senha aleatória de pelo menos 24 caracteres: `npx --yes vercel env add ADMIN_PASSWORD --environment production --sensitive`. O usuário do login é `admin`.
- Configure `GEMINI_API_KEY` no ambiente Production para a geração por IA. Não inclua credenciais em arquivos versionados ou comandos com valores explícitos.

## Configuração de IA (`.env`)

Copie `.env.example` para `.env` e preencha as credenciais do provedor desejado:

```bash
cp .env.example .env
```

### Google Gemini (Google AI Studio — Free Tier ou créditos Google Cloud)

```env
AI_PROVIDER=gemini
GEMINI_API_KEY="sua-chave-do-google-ai-studio"
AI_MODEL=gemini-3.5-flash-lite
```

- Também aceita `GOOGLE_API_KEY` no lugar de `GEMINI_API_KEY` e `GEMINI_BASE_URL` opcional (padrão: `https://generativelanguage.googleapis.com/v1beta/openai`).
- Compatível com as chaves novas do Google AI Studio (prefixo `AQ.`).

### OpenAI ou endpoint compatível (ex.: Ollama)

```env
OPENAI_API_KEY="sua-chave"
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

### Azure OpenAI

Configure `AI_PROVIDER=azure`, `AI_API_KEY`, `AI_ENDPOINT`, `AI_DEPLOYMENT` e opcionalmente `AI_API_VERSION`.

> **Segurança:** o arquivo `.env` está ignorado pelo Git e nunca deve ser versionado ou compartilhado. Reinicie o servidor após qualquer alteração no `.env`. Sem credenciais configuradas, `POST /api/syntheses/generate` retorna um erro explícito sem fabricar texto substituto.

## Endpoints da API local

| Método e rota | Descrição |
|---|---|
| `GET /` | Dashboard web (aceita `?director=...`) |
| `GET /assets/logotipo.png` | Logotipo oficial servido para a interface web |
| `GET /api/directors` | Lista ordenada de diretores reconhecidos na planilha |
| `GET /api/dashboard?director=...` | Indicadores gerais e por pergunta dos três públicos do diretor |
| `GET /api/syntheses?director=...&group=...` | Histórico de versões de síntese para um diretor e público |
| `POST /api/syntheses` | Salva nova versão (criação ou ajustes manuais) de uma síntese |
| `POST /api/syntheses/generate` | Gera sínteses por IA para todos os públicos do diretor (ou para um `group` específico, quando informado) |
| `POST /api/syntheses/approve` | Aprova uma versão de síntese (observação opcional) |
| `GET /report.pdf?director=...` | Gera e baixa a devolutiva individual em PDF (A4 paisagem) |
| `GET /reports.zip` | Gera e baixa um arquivo ZIP com as devolutivas em PDF de todos os diretores |

O armazenamento local de sínteses usa `.data/syntheses.json` (ou o caminho definido na variável `SYNTHESIS_STORE`).

## Estrutura do projeto

- `src/domain.ts` — tipos de domínio (grupos, importação, indicadores e estados).
- `src/importer.ts` e `src/cli.ts` — leitura sanitizada de `.xlsx`, validação da planilha e CLI de inspeção.
- `src/metrics.ts` e `src/dashboard.ts` — cálculo de médias gerais e por pergunta por diretor e público.
- `src/ai.ts` — geração de sínteses em linguagem simples via provedor compatível com OpenAI (Gemini, OpenAI, Azure).
- `src/synthesis.ts` e `src/store.ts` — versionamento, aprovação e persistência local das sínteses.
- `src/validation.ts`, `src/report.ts` e `src/pdf.ts` — checagem metodológica, montagem do relatório e renderização visual do PDF.
- `src/app.ts` e `src/server.ts` — aplicação HTTP com cabeçalhos de segurança, proteção anti-CSRF, validação de entrada, interface web unificada e endpoints JSON/PDF/ZIP.
- `assets/logotipo.png` — logotipo oficial de Fraiburgo utilizado na interface e no PDF.
- `test/` — suítes de testes automatizados (`node --test`).
