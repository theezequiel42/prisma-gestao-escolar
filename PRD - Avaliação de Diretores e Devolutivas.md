# PRD — Avaliação de Diretores e Devolutivas

**Status:** proposta para validação institucional.  
**Natureza:** requisitos de produto, agnósticos em tecnologia.  
**Escopo:** o que o produto deve oferecer, para quem, sob quais regras e com quais resultados. Este documento não define arquitetura, ferramentas, linguagens ou implementação.

## 1. Visão do produto

Aplicação para transformar os resultados das avaliações dos diretores da rede municipal em informações compreensíveis, confiáveis e úteis à gestão educacional. Deve permitir consultar os dados em um dashboard, compreender a percepção de cada grupo de respondentes e produzir devolutivas individuais em PDF para os gestores avaliados.

A primeira versão utilizará a planilha unificada existente. A evolução deverá permitir gestão persistente das informações em banco de dados e cadastros de pessoas, unidades, perguntas e ciclos avaliativos, sem perder o histórico nem alterar o significado dos resultados anteriores. A operação permanece centralizada na equipe interna da Secretaria, sem perfis separados de acesso, com os PDFs de devolutiva encaminhados externamente aos diretores.

## 2. Problema a resolver

Os resultados estão distribuídos em questionários com diferenças entre etapas de ensino e grupos de respondentes. A interpretação manual aumenta o risco de associar notas a perguntas erradas, comparar públicos não equivalentes e divulgar informações que permitam identificar respondentes. A elaboração individual de relatórios também pode gerar inconsistências e retrabalho.

O produto deve entregar uma leitura padronizada, mas sensível às particularidades de cada avaliação. A finalidade é apoiar o desenvolvimento da gestão escolar, não produzir rankings ou julgamentos automáticos sobre pessoas.

## 3. Objetivos e resultados esperados

- Disponibilizar uma fonte de consulta validada para as avaliações.
- Facilitar a identificação de pontos fortes, aspectos de atenção e diferenças de percepção entre públicos.
- Reduzir o trabalho repetitivo na preparação de devolutivas.
- Garantir coerência entre dados, indicadores, textos e PDFs.
- Preservar a confidencialidade dos respondentes e restringir o acesso aos resultados individuais.
- Permitir evolução para novos ciclos e questionários sem perder comparabilidade e rastreabilidade.

**Indicadores de sucesso:** tempo necessário para preparar uma devolutiva; proporção de relatórios aprovados sem correção de dados; divergências entre dashboard e PDF; avaliações com informações de origem e validação completas; compreensão dos relatórios pelos destinatários; incidentes de acesso indevido. Metas numéricas serão definidas após conhecer o processo atual e realizar um piloto.

## 4. Público e responsabilidades

### 4.1 Uso unificado pela equipe interna

A aplicação é operada de forma unificada pela equipe autorizada da Secretaria Municipal de Educação, **sem perfis separados de acesso** (não há separação entre perfil de elaboração, perfil de revisão/devolução ou portal de acesso individual para diretores).

Os ajustes nas sínteses e a aprovação ocorrem diretamente na mesma interface. Após gerados, os PDFs individuais de devolutiva são encaminhados externamente aos diretores avaliados pelos canais institucionais da Secretaria.

**Distinção obrigatória:** professores, funcionários e pais/responsáveis são grupos de respondentes do questionário (recortes de análise), não contas ou perfis de acesso da aplicação.

## 5. Base inicial e limites conhecidos

A fonte inicial é `avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx`, cuja aba principal reúne 2.202 respostas: 693 do lote Anos Iniciais, 732 de Anos Finais e 777 de Educação Infantil. A base possui 27 diretores distintos e 132 colunas, decorrentes da união dos questionários.

As colunas Nome Completo e CPF dos respondentes foram removidas. A coluna **Diretor(a) Avaliado(a)** identifica o gestor avaliado, e não o respondente. Horários e perfis de resposta ainda existem; portanto, a base não deve ser tratada como comprovadamente anônima.

As abas auxiliares registram as faixas de origem e o mapa das perguntas. A aplicação deve reconhecer a diferença entre essas informações de documentação e os registros de resposta, evitando contá-las como novas avaliações.

### Cuidados essenciais

- Colunas na mesma posição em versões diferentes não representam necessariamente a mesma pergunta.
- Perguntas de redação semelhante não são automaticamente equivalentes.
- Cabeçalhos repetidos podem pertencer a blocos de públicos diferentes.
- Uma pergunta ausente no questionário não equivale a resposta em branco.
- Não respondido, não aplicável e nota zero não são conceitos intercambiáveis.
- Uma submissão não representa necessariamente uma pessoa única; possíveis duplicidades ainda exigem decisão institucional.
- A etapa do lote de origem não substitui o cadastro das etapas atendidas por uma escola.
- Unidade de análise: avaliação de um diretor em um ciclo, com os públicos e o escopo correspondentes. Uma escola com várias etapas não gera automaticamente avaliações independentes do mesmo diretor.

## 6. Jornada principal

1. A equipe apresenta uma base de avaliação e identifica o ciclo e seu escopo.
2. O produto informa conteúdo reconhecido, contagens, diferenças de questionários e pendências.
3. A equipe revisa as pendências e autoriza a base para análise.
4. O usuário seleciona um diretor e consulta resultados por público, pergunta e dimensão disponível.
5. A equipe gera ou edita as sínteses de cada público diretamente na mesma interface.
6. O produto apresenta o conteúdo consolidado da devolutiva individual.
7. A equipe aprova as sínteses e gera o PDF individual da devolutiva.
8. O PDF gerado é exportado e encaminhado externamente ao diretor avaliado.

## 7. Requisitos funcionais — primeira versão

### RF-01 — Receber e reconhecer a planilha

O produto deve aceitar a base unificada atual, identificar a aba de respostas e considerar as informações auxiliares relevantes. Deve apresentar número de registros, diretores, grupos de respondentes, questionários e campos reconhecidos.

Dados obrigatórios ausentes, campos desconhecidos e valores incompatíveis devem ser apresentados de modo compreensível. Uma base com impedimentos de interpretação não pode gerar silenciosamente resultados oficiais.

### RF-02 — Validar e controlar o uso da base

Deve existir uma visão de pendências e um estado explícito de validação. Registros não devem ser excluídos, corrigidos ou deduplicados sem decisão registrada. A reapresentação de uma base não pode duplicar respostas silenciosamente.

Resultados preliminares devem ser identificados como tais. O produto deve distinguir uma prévia de análise de uma devolutiva aprovada.

### RF-03 — Selecionar o contexto da análise

Permitir localizar e selecionar diretor, ciclo, unidade e etapa/lote, quando essas informações estiverem disponíveis e validadas. O usuário deve sempre compreender quais dados estão sendo exibidos.

Filtros não devem misturar avaliações diferentes ou alterar silenciosamente o escopo do PDF. Informações de unidade e etapa ausentes não podem ser inventadas a partir do nome do diretor.

### RF-04 — Dashboard individual

Apresentar uma visão clara da avaliação do diretor selecionado, contendo:

- Identificação do gestor, ciclo, unidade e situação de validação, conforme disponibilidade.
- Quantidade de submissões por grupo de respondentes.
- Resultado médio por grupo, condicionado às regras de cálculo e confidencialidade.
- Distribuição das notas, quando permitida.
- Resultados por pergunta e por dimensão aprovada.
- Pontos fortes e aspectos de atenção sustentados pelos resultados.
- Indicação de ausência de respostas, baixa quantidade de registros e restrições de interpretação.

O painel deve priorizar a leitura, sem repetir a mesma média em vários componentes. Deve reunir as principais informações de cada público em seu respectivo cartão e apresentar **três caixas de síntese**, uma para professores, uma para funcionários e uma para pais/responsáveis, conforme os grupos existentes.

Não deve haver uma seção adicional de análise geral que apenas repita as três sínteses. Quando faltar base suficiente para um público, sua caixa deve explicar a limitação, sem fabricar uma análise.

### RF-05 — Explorar perguntas e dimensões

O usuário deve compreender o texto da pergunta, o público a que pertence, a versão do questionário e a quantidade de respostas válidas usada no indicador.

Dimensões temáticas somente poderão ser apresentadas quando houver classificação validada. O produto não deve atribuir automaticamente perguntas a dimensões oficiais inexistentes ou presumidas.

### RF-06 — Sínteses por público

Cada síntese deve ser breve, respeitosa e fundamentada no recorte exibido, contemplando percepção predominante, ponto forte e aspecto de atenção, quando houver evidência suficiente.

Não deve atribuir causas, intenções, competência pessoal ou culpa a partir das notas. Deve evitar superlativos, diagnósticos definitivos e alegações não demonstradas. Recomendações devem ser identificadas como sugestões, não como conclusões extraídas diretamente dos dados.

As sínteses devem poder ser revisadas e aprovadas pela equipe. O requisito é a qualidade e a rastreabilidade do texto, não a adoção de uma forma específica de produção.

### RF-07 — Gerar devolutiva individual em PDF

A devolutiva deve conter:

- Identificação institucional, gestor avaliado e contexto da avaliação.
- Ciclo e período de referência, quando conhecidos.
- Quantidades de respostas por público, sem denominá-las taxa de participação sem denominador válido.
- Indicadores e elementos visuais compreensíveis, com escala explicitada.
- Pontos fortes e aspectos de atenção por público, quando permitidos.
- As três sínteses revisadas, ou a indicação de insuficiência de dados.
- Nota metodológica, restrições de interpretação e situação do documento.
- Identificação da versão e data de emissão.

O PDF deve ser legível em tela e impresso, sem cortes, sobreposição ou dependência exclusiva de cores. Não deve incluir nomes, CPFs, horários individuais ou outros identificadores dos respondentes.

### RF-08 — Revisar, aprovar e exportar

Permitir prévia e exportação individual e em lote, respeitando o escopo e as permissões do usuário. A geração em lote deve informar documentos concluídos e pendentes, sem substituir silenciosamente versões aprovadas.

Uma alteração na base ou nos textos após aprovação deve exigir nova revisão antes da liberação de uma nova versão. O documento já emitido deve continuar associado ao recorte e às regras que o produziram.

Exportar PDF não significa enviá-lo ao diretor. Envio e disponibilização a destinatários são ações separadas, dependentes de autorização.

## 8. Regras de negócio e interpretação

### RN-01 — Escala e respostas válidas

A escala inicial observada é de 1 a 5. Apenas valores reconhecidos como válidos devem entrar nos indicadores. Novas escalas e rótulos dependerão de configuração e validação explícitas. Vazios e valores inválidos não podem reduzir médias como se fossem zero.

### RN-02 — Médias e denominadores

Todo indicador deve apresentar sua população de referência e quantidade de respostas válidas. A regra de composição da média de um público deverá ser aprovada antes da liberação oficial: média de todas as notas válidas ou média por respondente/pergunta podem produzir resultados diferentes quando há lacunas.

A nota metodológica deve declarar a regra escolhida, o tratamento de respostas ausentes e o arredondamento. Não deve existir média geral entre públicos com pesos implícitos ou não aprovados.

### RN-03 — Comparabilidade

Comparações somente devem ocorrer entre perguntas, públicos, escalas e contextos considerados compatíveis. Equivalências entre versões devem ser explicitamente validadas. Alterações substanciais de questionário devem ser sinalizadas em análises históricas.

A primeira versão não deve apresentar ranking de diretores. Uma nota menor não autoriza, isoladamente, uma conclusão de desempenho insatisfatório.

### RN-04 — Confidencialidade de grupos pequenos

Indicadores, distribuições e sínteses de grupos pequenos devem respeitar uma política institucional de proteção contra identificação, inclusive após filtros e nos PDFs.

**Proposta a validar:** mínimo de cinco respostas válidas no recorte divulgado. Esse valor é um parâmetro operacional proposto, não uma exigência legal universal. A instituição deverá aprovar também quando contagens exatas poderão ser mostradas e como tratar combinações de informações que permitam inferências sobre pessoas.

### RN-05 — Participação

Sem um universo elegível validado, o produto apresenta contagens de submissões, não percentual de participação. A definição de participação de famílias deverá esclarecer se considera responsável, família, estudante ou outra unidade. Para profissionais, o universo deve corresponder à lotação e ao período avaliados.

### RN-06 — Duplicidades e integridade

A base atual sem nome e CPF pode não permitir decidir com segurança se duas submissões pertencem à mesma pessoa. O produto não deve prometer deduplicação confiável sem evidência suficiente. Revisões autorizadas devem preservar o histórico das decisões e permitir reconciliar os totais anteriores e posteriores.

## 9. Evolução do produto

### Etapa A — Dashboard e devolutivas a partir da planilha

Entrega prioritária: validar a base atual, consultar avaliações individuais, revisar sínteses e emitir PDFs confiáveis. A planilha continua sendo a fonte de entrada, sem exigir imediatamente todos os cadastros futuros.

### Etapa B — Gestão persistente e cadastros

Evoluir para uma base de dados que reúna ciclos, avaliações e relacionamentos, com histórico preservado e menor dependência de planilhas manuais.

Cadastros previstos:

- **Pessoas:** identificação necessária à finalidade institucional e vínculos vigentes ou históricos. Pessoa cadastrada não implica conta de usuário. Respondentes não devem ser nominalmente vinculados a respostas por simples existência de um cadastro.
- **Diretores e vínculos de gestão:** associação entre pessoa, unidade, função e período, contemplando mudanças e substituições sem reescrever o passado.
- **Unidades e etapas:** identificação das unidades e etapas atendidas, com histórico pertinente.
- **Perguntas:** enunciado, público, dimensão validada, escala e versões. Alterações não devem modificar retrospectivamente perguntas já respondidas.
- **Questionários:** conjuntos de perguntas aplicáveis a cada público e contexto, com vigência e versão.
- **Ciclos avaliativos:** período, escopo, avaliações vinculadas e situação de abertura, revisão ou encerramento.

### Etapa C — Acompanhamento histórico entre ciclos

Permitir o acompanhamento de diferentes ciclos avaliativos e comparações históricas somente quando metodologicamente justificadas, mantendo o uso interno unificado pela equipe (sem perfis separados ou portal para diretores) e a exportação dos PDFs para encaminhamento externo.

A transição da planilha para banco de dados deve reconciliar integralmente registros e resultados aprovados, preservando integralmente o histórico.

## 10. Requisitos de qualidade, segurança e governança

- **Confiabilidade:** resultados iguais para a mesma base, recorte e regras; divergências de validação claramente informadas.
- **Rastreabilidade:** origem dos dados, versão de questionário, regra de cálculo, alterações relevantes e responsável pela aprovação identificáveis.
- **Privacidade:** minimização de dados pessoais e acesso limitado à finalidade autorizada. Retirar nome e CPF não equivale automaticamente a anonimizar.
- **Controle de acesso:** conteúdos individuais não devem ficar públicos; consultas e exportações devem respeitar as mesmas restrições.
- **Continuidade:** preservar dados e relatórios e comprovar possibilidade de recuperação antes do uso institucional definitivo. Prazos de retenção, exclusão e responsabilidades dependem de aprovação.
- **Usabilidade:** linguagem clara, filtros compreensíveis e distinção visual entre preliminar, aprovado e indisponível.
- **Acessibilidade:** informações não dependentes apenas de cor; textos e gráficos legíveis; interação e leitura acessíveis no painel e nos relatórios.
- **Desempenho percebido:** a base inicial deve permitir navegação e exportação sem bloqueios que inviabilizem o trabalho. Metas de tempo e volume deverão ser acordadas no piloto, incluindo geração em lote.
- **Portabilidade:** a instituição deve conseguir recuperar seus dados, relatórios e definições de questionários em formatos utilizáveis fora do produto.

## 11. Fora do escopo inicial

- Coleta direta de novas respostas e substituição dos formulários existentes.
- Ranking público, divulgação aberta ou comparação punitiva automatizada.
- Decisões automáticas de permanência, nomeação ou desligamento de gestores.
- Integração obrigatória com sistemas externos de matrícula ou recursos humanos.
- Percentual de participação sem universo elegível validado.
- Envio automático de PDFs sem aprovação e destinatários confirmados.
- Cadastro nominal dos respondentes como condição para analisar os dados atuais.
- Adoção obrigatória de inteligência artificial ou de qualquer tecnologia específica.

## 12. Critérios de aceite

1. A base inicial é reconhecida com 2.202 respostas e a reconciliação dos três lotes, sem contar abas auxiliares como respostas.
2. A coluna Diretor(a) Avaliado(a) identifica corretamente o gestor de cada registro; nomes e CPFs dos respondentes não aparecem no painel ou no PDF.
3. Nenhuma pergunta é associada a uma resposta por mera coincidência de posição ou semelhança textual.
4. Cada indicador permite compreender público, quantidade válida, escala e regra de cálculo; vazios não são tratados como zero.
5. Os filtros mantêm explícito o recorte e não permitem contornar restrições de confidencialidade.
6. O dashboard apresenta sínteses por público sem seções repetitivas, e informa quando não há dados suficientes.
7. O PDF corresponde ao mesmo recorte e versão aprovados, é legível e não contém detalhes individuais de respondentes.
8. Resultados não aprovados são identificados como preliminares; alterações relevantes exigem nova revisão.
9. A exportação em lote reconcilia documentos esperados, concluídos e pendentes.
10. Na evolução dos cadastros, mudanças de vínculo ou enunciado não reescrevem avaliações anteriores.
11. Na migração para banco de dados, os totais e resultados aprovados permanecem reconciliados com a fonte anterior.

## 13. Decisões pendentes antes da liberação oficial

- Regra oficial de cálculo das médias e arredondamento.
- Correspondência entre rótulos de perfis respondentes e grupos apresentados ao usuário.
- Classificação das perguntas por dimensão e equivalências admitidas entre versões.
- Política para duplicidades, correções e reapresentação de bases.
- Critérios para classificar pontos fortes e aspectos de atenção, inclusive empates e diferenças pequenas.
- Universo elegível e unidade de contagem para eventual taxa de participação.
- Identificação institucional e conteúdo obrigatório da devolutiva oficial.
- Política de retenção e arquivamento das devolutivas encaminhadas externamente.

**Princípio de aprovação:** hipóteses e propostas deste PRD não substituem decisões institucionais. Pendências que afetem cálculo, privacidade ou significado dos resultados impedem a liberação oficial do conteúdo afetado, sem impedir sua revisão interna identificada como preliminar.
