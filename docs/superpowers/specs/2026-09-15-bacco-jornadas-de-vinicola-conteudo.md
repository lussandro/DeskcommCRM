# Anexo — Pacote de conteúdo das jornadas de vinícola

> Anexo definitivo da spec das jornadas de vinícola do Bacco Adega CRM.
> Este arquivo é **conteúdo**, não código: descreve o que cada jornada semeia
> (funil, motivos de perda, campos, tags, respostas rápidas, cadências, tipos de
> agenda e FAQ). As decisões do dono já estão aplicadas — ver *Decisões tomadas*.

Quatro jornadas independentes. A vinícola escolhe no onboarding quais usa; cada
uma nasce completa e nenhuma depende das outras.

**Nada aqui inventa dado de vinícola nenhuma.** Todo valor que muda de casa para
casa está como `{{lacuna}}` e aparece listado na seção *Lacunas* de cada jornada.
A lacuna é um lembrete, não um bug.

**Quem mantém a lacuna visível é o composer do atendimento, e a explicação
anterior deste anexo estava trocada.** Ela dizia que a lacuna sobrevive porque
`preencherModeloDeMensagem` a devolve em `lacunas` — e isso conta a metade que
não protege o operador. Medido:

| Caminho | O que faz com `{{lacuna}}` | Onde |
|---|---|---|
| Composer do atendimento (o que o operador usa ao escolher a resposta rápida) | **mantém o literal** `{{lacuna}}` no texto: marcação desconhecida ou sem valor volta como veio | `lib/inbox/template-vars.ts:10-19`, chamado em `components/inbox/Composer.tsx:148` |
| `preencherModeloDeMensagem` (prévia, e o que alimenta o MCP) | `renderTemplate` **apaga** a marcação — troca por **string vazia** —, e por isso a função devolve `lacunas` à parte, como aviso | `lib/operacao/modelos-de-mensagem.ts:91-92`; `lib/automation/template.ts` |

Ou seja: no composer a lacuna aparece e o operador a vê para preencher; na
prévia ela some do texto e reaparece como lista. As duas se sustentam, mas é a
primeira que faz a lacuna chegar ao operador **visível**.

**Marcação de nome é `{{nome}}` — nunca `{{contact.name}}`.** A regex de
`interpolateTemplate` é `/\{\{\s*([a-zA-Z_]+)\s*\}\}/g` e **não casa ponto**:
`{{contact.name}}` não é reconhecida como marcação e sairia literal no celular do
cliente. As marcações de nome que o composer resolve são **`{{nome}}`** (nome
completo) e **`{{primeiro_nome}}`**, e quando o contato não tem nome cadastrado o
literal é mantido — de propósito, para não gerar texto quebrado
(`lib/inbox/template-vars.ts:1-5`). Este anexo usa `{{nome}}`.

**Só português.** Não há versão em espanhol nem em inglês do conteúdo de vendas.
O que o pacote registra é o *fato* de qual idioma o visitante prefere (campo
*Idioma de preferência*, na jornada de enoturismo) e o que a vinícola declara
atender (`{{idiomas_atendidos}}`) — nunca uma tradução que ninguém revisou.

---

## Vocabulário do produto usado aqui

Conferido no código, não suposto.

| Conceito | O que o produto oferece | Onde |
|---|---|---|
| Vocabulário do funil | `lead`, `deal`, `won`, `lost` (até 40 caracteres cada) | `lib/schemas/settings.ts` (`pipelineConfigPatchSchema`) |
| Tipo de campo | texto, área de texto, número, data, seleção, múltipla seleção, sim/não, e-mail, telefone, URL | `customFieldSchema` |
| Chave de campo | `^[a-z][a-z0-9_]*$`, até 40 caracteres — **começa por letra e não aceita hífen** | `customFieldSchema` |
| Limites do funil | até 50 campos e até 50 motivos de perda próprios (80 caracteres cada) | `pipelineConfigPatchSchema` |
| Motivo de perda | lista canônica do produto + lista própria do funil (`settings.lost_reasons`) | `lib/schemas/leads.ts` |
| Gatilho de cadência | Manual · Silêncio · Mudança de etapa no funil · Falta confirmada pela equipe · Fim da conversa · Quando o agente pede ajuda de um humano · Disparado por uma automação em Webhooks | `lib/followup/vocabulario.ts` |
| Fim da cadência | O contato respondeu · Pediu para parar · Passou para um humano · Esgotado | idem |
| Categoria de agenda | Consulta · Procedimento · Retorno · Visita · Vistoria · Reunião · Call · Orçamento · Demonstração · Outro | `lib/agenda/tipos.ts` |
| Local do compromisso | Presencial · Telefone · WhatsApp · Link de vídeo · Google Meet — **um só por tipo** | idem |
| Dica de passo do agente | `new` · `contacted` · `qualifying` · `qualified` · `negotiating` · `won` · `lost`, **única por funil** | `crm_stages.agent_stage_hint` |

Slug de etapa neste anexo obedece `^[a-z0-9_-]{2,40}$`. Slug é único **dentro do
funil**, não entre funis — por isso `novo_contato` aparece em duas jornadas.

### O slug desta tabela é DERIVADO, não digitado

O aplicador não fixa slug à mão: ele reusa `etapasParaGravar(proposta, slugDeNome)`
(`lib/onboarding/proposta-de-funil.ts:171`), a mesma função que o onboarding já
usa (`app/actions/onboarding/montarQuadro.ts:237`), e o slug sai de `slugDeNome`
(`lib/leads/stage-editing.ts:121`): sem acento, minúsculas, tudo que não é
letra ou número vira `_`, e colisão dentro do funil ganha sufixo `_2`.

**Os slugs nas tabelas abaixo são informativos** — valem como o que a derivação
produz, e o teste de forma do plano compara o anexo contra o derivado, nunca
contra uma lista digitada. Foi assim que se achou o único erro que havia aqui:
*Entendendo o canal* deriva `entendendo_o_canal`, e este anexo dizia
`entendendo_canal`. Para conferir qualquer nome sem acreditar nesta linha, a
conta é a de `slugDeNome`:

```bash
node -e 'const n=process.argv[1];console.log(n.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40).replace(/^_+|_+$/g,""))' "Entendendo o canal"
```

`etapasParaGravar` também é quem dá `position` (de 1000 em 1000, o passo que o
`midpoint()` do arrastar-e-soltar espera) e quem **deriva `is_won`/`is_lost` do
passo**, nunca como campo próprio — é o que impede a discordância que o CHECK
`crm_stages_hint_coerente_com_won_lost` vigia.

### Local do compromisso é um valor só

`calendar_event_types.location_kind` é **uma** coluna de valor único, com CHECK em
`in_person, phone, whatsapp, video_link, google_meet`
(`supabase/baseline.sql:15168`). "Google Meet ou Presencial" não é gravável: o
tipo tem um local, não dois. Onde o rascunho oferecia os dois, este anexo escolhe
**Google Meet** — quem precisa do presencial marca o tipo presencial que a mesma
jornada já traz.

### Dica de passo do agente (`agent_stage_hint`)

Cada etapa pode declarar em que ponto da venda ela está, para o agente de IA.
O vocabulário é fechado pelo CHECK `crm_stages_agent_stage_hint_check`
(`supabase/baseline.sql:9038`) e a dica é **única por funil**
(`uniq_crm_stages_pipeline_hint`, `:9079`). Um segundo CHECK
(`crm_stages_hint_coerente_com_won_lost`, `:9055`) obriga a coerência: `won` só em
etapa de ganho, `lost` só em etapa de perdido, e etapa de ganho/perdido não pode
usar outra dica.

Sobram, portanto, **cinco dicas não-terminais** (`new`, `contacted`, `qualifying`,
`qualified`, `negotiating`) para as etapas de trabalho de cada funil.

⚠️ **As cinco são OBRIGATÓRIAS em toda jornada, e isso é gate, não estilo.**
`PASSOS_QUE_PRECISAM_DE_ETAPA` (`lib/leads/agent-mapping.ts:261`) lista exatamente
esses cinco, e `lib/onboarding/proposta-de-funil.test.ts:43-57` exige de **todo**
pacote `cobertura.faltando === []` e `cobertura.traduzidos === 5`. Um pacote a que
falte uma dica é um funil que o agente não sabe percorrer inteiro — e o teste
reprova antes de chegar ao banco.

Daí sai o piso de **5 etapas de trabalho + 1 de ganho + 1 de perdido = 7 etapas**
por jornada. Foi por esse gate que o clube ganhou *Plano escolhido*: com 6 etapas
ele deixava `qualified` sem destino e reprovaria.

**Etapa de trabalho a mais que 5 fica sem dica, e isso é resposta, não pendência.**
`EtapaProposta.passo` é `LeadStage | null` e o `null` é documentado como "coluna
que só pessoas movem" (`lib/onboarding/proposta-de-funil.ts:32-38`); o CHECK
aceita `agent_stage_hint` nulo (`supabase/baseline.sql:9039`), e `coberturaDoFunil`
só conta as dicas presentes — uma etapa sem dica **não** tira a cobertura de 5/5
(`lib/leads/agent-mapping.ts:295-301`). O que o schema proíbe é a dica **repetida**.

**O B2B é a única jornada com 6 etapas de trabalho**, e por isso a única com uma
etapa sem dica: `amostra_ou_degustacao`, declarada na tabela da jornada 1.

O teto também é gate: `MAX_ETAPAS = 8` e `MIN_ETAPAS = 4`
(`lib/onboarding/proposta-de-funil.ts:52-53`). O canal fica **no teto, com 8**;
nenhuma jornada pode crescer além disso sem tirar outra etapa.

### Opções de campo de seleção: o par `{ value, label }`

Campo `select` e `multiselect` não aceita lista de textos. `customFieldSchema`
exige `options: { value, label }[]`, ambos `min(1)`
(`lib/schemas/settings.ts`, `customFieldSchema`). A regra deste anexo, aplicada em
todas as tabelas de campos:

> **`value` = slug do rótulo**: minúsculas, sem acento, espaços e pontuação
> viram `_`.

Assim *Bar/wine bar* vira `bar_wine_bar` e *Não informado* vira `nao_informado`.
O `value` é o que fica gravado no lead e o que qualquer relatório futuro agrupa —
por isso ele não muda quando a vinícola reescreve o rótulo na tela.

### Não existe gatilho "compromisso concluído"

Toda cadência de pós-visita e de pós-venda aqui usa **Mudança de etapa no funil**
(para a etapa de realizado/pago) ou, quando couber, **Falta confirmada pela
equipe**. Não há pedido de feature neste anexo: o gatilho por conclusão de
compromisso está **fora desta entrega**.

### Por que cada passo de cadência também é uma resposta rápida

O nó de mensagem de um fluxo tem três modos
(`actionConfigSchema`, `lib/followup/graph-schema.ts`): `text` (corpo escrito ali
mesmo), `ai_message` e `template` (aponta para uma resposta rápida de
`message_templates`). Este pacote usa **sempre o modo `template`**: cada passo de
mensagem de cadência existe também como resposta rápida do pacote, com título e
atalho próprios, e a cadência referencia esse atalho.

Isso rende três coisas concretas:

1. **O texto que o cliente recebe fica visível e editável na tela de respostas
   rápidas**, sem abrir o construtor de fluxo.
2. **O mesmo texto serve ao operador manualmente** — o que a cadência manda às
   2h da manhã é o que o atendente manda à mão às 15h.
3. **Um texto, um lugar.** Corrigir a frase corrige os dois usos.

⚠️ **Medido, e é o que manda sobre o texto das cadências:** nem o modo `text` nem
o modo `template` resolvem marcação de nome no envio automático. O corpo do
passo passa só por `interpolarVoltaDoPayload`
(`lib/agent-engine/agent/followup-turn.ts:480`, via `resolveFlowSendBody` em
`:485-507`), que troca exclusivamente `{{volta}}` e `{{voltas}}`. As duas funções
que conhecem o nome do contato **não têm chamador no caminho de follow-up**:

- `interpolateTemplate` (`lib/inbox/template-vars.ts:10`) — `{{nome}}` e
  `{{primeiro_nome}}` — só é chamada pelo composer do atendimento
  (`components/inbox/Composer.tsx:148`);
- `renderTemplate` (`lib/automation/template.ts`) — só pela prévia do operador
  (`lib/operacao/modelos-de-mensagem.ts:91`, que também alimenta o MCP) e pela
  ação de Webhooks (`lib/automation/actions/send-whatsapp.ts`).

**Consequência aplicada neste anexo:** nenhuma mensagem de cadência usa
`{{nome}}` — sairia literal no celular do cliente. As frases de cadência foram
escritas para funcionar sem nome, o que também as deixa boas para quem chegou sem
nome cadastrado. Nas respostas rápidas **do operador**, onde o composer resolve, o
nome aparece como `{{nome}}`.

### Lacuna dentro de mensagem automática

Num passo de cadência só valem lacunas que a **vinícola preencheu previamente na
própria resposta rápida**. Lacuna de dado do momento — disponibilidade de hoje,
data combinada, resumo do pedido — **não entra em mensagem automática**: ninguém
vai preenchê-la antes do disparo, e ela sai literal.

Onde um dado fixo da vinícola é imprescindível dentro de um passo automático, a
resposta rápida vem marcada **"revisar antes de publicar a cadência"** — a
vinícola troca a lacuna pelo valor dela antes de publicar o fluxo. **É uma só no
pacote inteiro** (`/eno-pos-2`), assinalada na tabela da jornada 2.

Este número já foi "três" e depois "duas" em dois pontos do mesmo documento, o
que por si só dizia que ninguém o estava recontando. Hoje é **uma**, e a razão é
concreta: a outra candidata era `/eno-vespera`, que saiu do pacote quando a
véspera deixou de ser passo de cadência (jornada 2, cadência A).

### Estado em que os fluxos nascem

Todo fluxo de follow-up deste pacote nasce em **rascunho**. Publicar depende de
três coisas fora do pacote, e as três são da instalação, não do conteúdo:

1. um **agente de IA publicado**,
2. com **follow-up ligado** nesse agente,
3. e o **WhatsApp conectado**.

Semear o pacote não publica fluxo nenhum, e não deve publicar: um fluxo publicado
numa instalação sem canal conectado é cadência que falha no envio.

---

## Jornada 1 — Canal e revenda

Distribuidores, importadores, restaurantes, hotéis, empórios.

### 1. Funil

**Nome:** Canal e revenda

| Conceito | Palavra na tela |
|---|---|
| lead | Contato comercial |
| deal | Proposta |
| won | Pedido fechado |
| lost | Não fechou |

| # | Nome curto | Slug | Dica | O que caracteriza um contato aqui |
|---|---|---|---|---|
| 1 | Novo contato | `novo_contato` | `new` | Chegou pedindo tabela, representação ou condições, e ninguém falou com ele ainda. |
| 2 | Entendendo o canal | `entendendo_o_canal` | `contacted` | Sabemos que tipo de estabelecimento é, onde atua e o que já vende. |
| 3 | Cadastro conferido | `cadastro_conferido` | `qualifying` | Dados de revenda conferidos conforme `{{exigencias_de_cadastro}}`; pode receber tabela. |
| 4 | Tabela enviada | `tabela_enviada` | `qualified` | Recebeu tabela e condições; está avaliando. |
| 5 | Amostra ou degustação | `amostra_ou_degustacao` | **— (sem dica)** | Pediu amostra, visita do representante ou degustação para a equipe dele. |
| 6 | Negociando pedido | `negociando_pedido` | `negotiating` | Está discutindo mix, volume, prazo ou entrega de um pedido concreto. |
| 7 | Pedido fechado | `pedido_fechado` | `won` | Pedido confirmado pelo canal — **ganho**. |
| 8 | Não fechou | `nao_fechou` | `lost` | Encerrado sem pedido — **perdido**, com motivo escolhido. |

São 6 etapas de trabalho + 1 de ganho + 1 de perdido. O dono decidiu manter as 8
colunas, com *Cadastro conferido* como etapa: no B2B de bebida, contato sem
cadastro de pessoa jurídica não pode receber tabela, e uma etapa que trava a
tabela é mais visível no quadro do que um campo que ninguém olha.

**Esta é a jornada que fica com uma etapa sem dica**, e a escolha é deliberada:
são 6 etapas de trabalho para 5 dicas não-terminais. *Amostra ou degustação* é a
que abre mão porque é a **única opcional** do fluxo — muitos canais vão de
*Tabela enviada* direto a *Negociando pedido* —, e uma dica gasta num desvio
tiraria o nome certo de uma etapa pela qual todo mundo passa.

### 2. Motivos de perda

| Texto exato que o operador escolhe |
|---|
| Preço acima do que o canal trabalha |
| Não é revenda — sem cadastro de pessoa jurídica |
| Volume mínimo não atendido |
| Já trabalha com outra vinícola |
| Fora da região que atendemos |
| Parou de responder |

### 3. Campos personalizados

| Rótulo | Chave | Tipo | Opções |
|---|---|---|---|
| Tipo de canal | `tipo_de_canal` | seleção | `distribuidor` Distribuidor · `importador` Importador · `restaurante` Restaurante · `bar_wine_bar` Bar/wine bar · `hotel_ou_pousada` Hotel ou pousada · `emporio_ou_loja` Empório ou loja · `supermercado` Supermercado · `outro` Outro |
| Região de atuação | `regiao_de_atuacao` | seleção | `norte` Norte · `nordeste` Nordeste · `centro_oeste` Centro-Oeste · `sudeste` Sudeste · `sul` Sul |
| Estado (UF) | `estado_uf` | texto | — |
| Volume estimado por mês (garrafas) | `volume_mensal_garrafas` | número | — |
| Rótulos de interesse | `rotulos_de_interesse` | múltipla seleção | `tinto` Tinto · `branco` Branco · `rose` Rosé · `espumante` Espumante · `frisante` Frisante · `licoroso` Licoroso · `suco_de_uva` Suco de uva · `sem_alcool` Sem álcool |
| Já revende vinho nacional | `revende_vinho_nacional` | seleção | `sim` Sim · `nao` Não · `nao_informado` Não informado |
| Forma de recebimento | `forma_de_recebimento` | seleção | `entrega_no_estabelecimento` Entrega no estabelecimento · `retirada_na_vinicola` Retirada na vinícola · `transportadora_do_canal` Transportadora do canal |
| Data do último pedido | `data_ultimo_pedido` | data | — |

### 4. Tags

`canal-b2b` · `distribuidor` · `restaurante` · `hotel` · `emporio` ·
`aguarda-amostra` · `pedido-recorrente` · `sem-cadastro-pj`

### 5. Respostas rápidas

**Do operador** — disparadas à mão na conversa.

| Título | Atalho | Corpo |
|---|---|---|
| Boas-vindas do canal | `/canal-ola` | Olá, {{nome}}! Aqui é a {{nome_da_vinicola}}. Que bom ter você por aqui. Me conta rapidinho: é restaurante, loja, distribuidora? E em que cidade vocês atuam? |
| Pedir dados de cadastro | `/canal-cadastro` | Para abrir o cadastro de revenda eu preciso de: {{exigencias_de_cadastro}}. Pode mandar por aqui mesmo que eu encaminho. |
| Enviar tabela | `/canal-tabela` | Segue nossa tabela para revenda. As condições de pedido são {{condicoes_comerciais}}. Qualquer dúvida sobre rótulo ou mix, me chama. |
| Pedido mínimo | `/canal-minimo` | Nosso pedido mínimo para revenda é {{pedido_minimo}}. Dá para montar mix entre os rótulos, não precisa fechar caixa de um só. |
| Amostra | `/canal-amostra` | Consigo providenciar amostra dentro da nossa política: {{politica_de_amostra}}. Me confirma o endereço de entrega e a quem devo endereçar? |
| Visita do representante | `/canal-visita` | Posso pedir para o nosso representante passar aí. A região é atendida {{agenda_do_representante}}. Que dia da semana funciona melhor para vocês? |
| Retomar proposta | `/canal-retomada` | {{nome}}, tudo certo por aí? Fico à disposição para ajustar o mix da proposta se ficou algo fora do que vocês vendem. |
| Prazo e entrega | `/canal-entrega` | O prazo de separação é {{prazo_de_expedicao}} e a entrega sai {{modalidade_de_entrega}}. Assim que o pedido entra eu te confirmo a data. |
| Não é revenda | `/canal-sem-pj` | Nossa tabela de revenda é só para pessoa jurídica. Mas dá para comprar como consumidor: {{canal_de_venda_ao_consumidor}}. Quer que eu te ajude por lá? |
| Fechamento do pedido | `/canal-fechamento` | Fechado assim: {{resumo_do_pedido}}. Pagamento em {{condicoes_de_pagamento}}. Confirma que eu já coloco na expedição. |

**De cadência** — cada uma é um passo de fluxo. Sem lacunas.

| Título | Atalho | Corpo |
|---|---|---|
| Cadência · tabela, 1º toque | `/canal-tabela-1` | Conseguiu dar uma olhada na tabela? Se quiser, eu monto uma sugestão de mix para o perfil da casa de vocês. |
| Cadência · tabela, 2º toque | `/canal-tabela-2` | Passando para deixar registrado: a proposta segue de pé. Se o que travou foi volume ou prazo, me fala que eu vejo o que dá. |
| Cadência · tabela, encerramento | `/canal-tabela-3` | Vou deixar você em paz por enquanto. Quando quiser retomar, é só responder aqui. |
| Cadência · silêncio, 1º toque | `/canal-silencio-1` | Ficou faltando algo da minha parte para fechar? |
| Cadência · silêncio, 2º toque | `/canal-silencio-2` | Se o momento não for agora, sem problema — me diz só quando você prefere que eu volte a falar. |
| Cadência · recompra, 1º toque | `/canal-recompra-1` | Tudo bem por aí? Já está na hora de repor? Posso repetir o último pedido ou ajustar o mix. |
| Cadência · recompra, 2º toque | `/canal-recompra-2` | Se preferir, eu deixo separado e você me confirma a data de entrega. |

### 6. Cadências

**A. Tabela enviada sem retorno**

- Gatilho: *Mudança de etapa no funil* → Tabela enviada
- Passo 1 — espera 2 dias → `/canal-tabela-1`
- Passo 2 — espera 5 dias → `/canal-tabela-2`
- Passo 3 — espera 10 dias → `/canal-tabela-3`
- Para quando: o contato respondeu · a proposta mudou de etapa · pediu para parar

**B. Silêncio na negociação**

- Gatilho: *Silêncio* de 7 dias
- Passo 1 — imediato → `/canal-silencio-1`
- Passo 2 — espera 7 dias → `/canal-silencio-2`
- Para quando: o contato respondeu · passou para um humano · pediu para parar

**C. Recompra do canal**

- Gatilho: *Manual* (o operador inscreve o canal que já comprou)
- Passo 1 — imediato → `/canal-recompra-1`
- Passo 2 — espera 7 dias → `/canal-recompra-2`
- Para quando: o contato respondeu · pediu para parar

### 7. Tipos de agenda

| Tipo | Categoria | Duração sugerida | Local |
|---|---|---|---|
| Reunião comercial | Reunião | 45 min | Google Meet |
| Visita do representante | Visita | 60 min | Presencial (no canal) |
| Degustação para a equipe do canal | Visita | 90 min | Presencial |
| Call de retomada | Call | 20 min | Telefone |

### 8. Perguntas frequentes (agente de IA)

1. **Vocês vendem para revenda?** Sim. Para revenda trabalhamos só com pessoa jurídica, e o cadastro pede {{exigencias_de_cadastro}}.
2. **Qual o pedido mínimo?** {{pedido_minimo}}. Pode ser mix de rótulos.
3. **Vocês atendem minha região?** Atendemos {{regioes_atendidas}}. Me diz a cidade que eu confirmo.
4. **Como recebo os produtos?** {{modalidade_de_entrega}}, com prazo de separação de {{prazo_de_expedicao}}.
5. **Tem material de apoio para o salão?** Temos {{materiais_de_apoio}}. Vai junto com o pedido.
6. **Dá para fazer degustação com a minha equipe?** Dá. Fazemos {{formato_de_degustacao_para_canal}} — posso agendar.
7. **Quais as condições de pagamento?** {{condicoes_de_pagamento}}.
8. **Dá para ter exclusividade da marca na cidade?** Isso é caso a caso e quem decide é a nossa área comercial — vou registrar seu pedido e alguém te responde.

### 9. Lacunas desta jornada

| Lacuna | O que a vinícola preenche |
|---|---|
| `{{nome_da_vinicola}}` | Nome pelo qual a vinícola se apresenta no WhatsApp |
| `{{exigencias_de_cadastro}}` | Documentos e dados exigidos para abrir cadastro de revenda |
| `{{condicoes_comerciais}}` | Condições gerais de revenda (prazo, desconto por volume) |
| `{{pedido_minimo}}` | Pedido mínimo em garrafas, caixas ou valor |
| `{{politica_de_amostra}}` | Se envia amostra, para quem, quantas e quem paga o envio |
| `{{agenda_do_representante}}` | Como e quando a região é visitada |
| `{{prazo_de_expedicao}}` | Prazo entre pedido confirmado e saída da mercadoria |
| `{{modalidade_de_entrega}}` | Frota própria, transportadora, retirada |
| `{{canal_de_venda_ao_consumidor}}` | Para onde mandar quem não é revenda |
| `{{resumo_do_pedido}}` | Preenchido pelo operador na hora |
| `{{condicoes_de_pagamento}}` | Prazos e formas aceitas no B2B |
| `{{regioes_atendidas}}` | Onde a vinícola entrega |
| `{{materiais_de_apoio}}` | Taça, display, carta, treinamento |
| `{{formato_de_degustacao_para_canal}}` | Como é a degustação para a equipe do canal |

---

## Jornada 2 — Enoturismo

Visitas e degustações na vinícola.

### 1. Funil

**Nome:** Visitas e degustações

| Conceito | Palavra na tela |
|---|---|
| lead | Interessado |
| deal | Visita |
| won | Visita realizada |
| lost | Não veio |

| # | Nome curto | Slug | O que caracteriza um contato aqui |
|---|---|---|---|
| 1 | Novo interessado | `novo_interessado` | `new` | Perguntou sobre visita, degustação ou passeio; ainda sem data. |
| 2 | Tirando dúvidas | `tirando_duvidas` | `contacted` | Está perguntando horário, valor, o que inclui, como chega. |
| 3 | Escolhendo data | `escolhendo_data` | `qualifying` | Quer vir; falta acertar dia, horário e número de pessoas. |
| 4 | Aguardando confirmação | `aguardando_confirmacao` | `qualified` | Data proposta; falta o interessado confirmar conforme `{{politica_de_reserva}}`. |
| 5 | Reserva confirmada | `reserva_confirmada` | `negotiating` | Compromisso marcado na agenda, com data, horário e número de pessoas. |
| 6 | Visita realizada | `visita_realizada` | `won` | A visita aconteceu — **ganho**. |
| 7 | Não veio | `nao_veio` | `lost` | Desistiu, não apareceu ou não deu para atender — **perdido**, com motivo. |

As 5 etapas de trabalho cabem nas 5 dicas não-terminais: nenhuma fica sem dica.

### 2. Motivos de perda

| Texto exato que o operador escolhe |
|---|
| Menor de 18 anos |
| Sem data disponível no período que ele queria |
| Grupo não confirmou |
| Desistiu — escolheu outro passeio |
| Não compareceu |
| Só queria informação |

### 3. Campos personalizados

| Rótulo | Chave | Tipo | Opções |
|---|---|---|---|
| Número de pessoas | `numero_de_pessoas` | número | — |
| Data pretendida | `data_pretendida` | data | — |
| Tipo de grupo | `tipo_de_grupo` | seleção | `casal` Casal · `familia` Família · `amigos` Amigos · `sozinho` Sozinho · `corporativo` Corporativo · `agencia_ou_operadora` Agência ou operadora |
| Tem crianças no grupo | `tem_criancas` | seleção | `sim` Sim · `nao` Não · `nao_informado` Não informado |
| Cidade de origem | `cidade_de_origem` | texto | — |
| Interesse | `interesse_na_visita` | múltipla seleção | `degustacao` Degustação · `tour_no_vinhedo` Tour no vinhedo · `tour_na_cantina` Tour na cantina · `refeicao` Refeição · `compra_na_loja` Compra na loja · `evento_privado` Evento privado |
| Idioma de preferência | `idioma_de_preferencia` | seleção | `portugues` Português · `espanhol` Espanhol · `ingles` Inglês |
| Como chegou até nós | `origem_do_contato` | seleção | `instagram` Instagram · `google` Google · `indicacao` Indicação · `agencia` Agência · `ja_visitou_antes` Já visitou antes · `outro` Outro |

> *Idioma de preferência* registra um fato do visitante para a equipe se
> preparar. Ele **não** promete atendimento naquele idioma: quem diz o que a
> casa atende é `{{idiomas_atendidos}}`, e o conteúdo do pacote é só português.

### 4. Tags

`enoturismo` · `grupo-grande` · `agencia-de-turismo` · `com-criancas` ·
`feriado` · `visita-remarcada` · `visitante-estrangeiro` · `nao-compareceu`

### 5. Respostas rápidas

**Do operador.**

| Título | Atalho | Corpo |
|---|---|---|
| Boas-vindas da visita | `/eno-ola` | Olá, {{nome}}! Que bom que você quer conhecer a {{nome_da_vinicola}}. Me conta: para quantas pessoas e que dia você pensou? |
| Horários e roteiros | `/eno-horarios` | Recebemos visitas {{horario_visitas}}. O roteiro é {{roteiro_da_visita}} e leva cerca de {{duracao_da_visita}}. |
| Valores | `/eno-valores` | A visita com degustação fica em {{valor_da_visita}} por pessoa. {{o_que_inclui}}. |
| Como chegar | `/eno-como-chegar` | Estamos em {{endereco_da_vinicola}}. {{orientacao_de_acesso}}. Qualquer coisa me chama no dia. |
| Confirmação da reserva | `/eno-confirmada` | Reserva confirmada: {{data_e_hora}}, para {{numero_de_pessoas}} pessoas. Chegue uns minutos antes para começarmos no horário. |
| Grupos | `/eno-grupo` | Para grupos a partir de {{tamanho_de_grupo}} pessoas temos condições e horários próprios: {{condicoes_de_grupo}}. Quantas pessoas seriam? |
| Crianças e pets | `/eno-criancas-pets` | Crianças podem vir, com a degustação só para maiores de 18. {{politica_de_criancas_e_pets}}. |
| Idade mínima | `/eno-idade` | A degustação é só para maiores de 18 anos — é lei. Todo mundo do grupo é maior de idade? |
| Remarcar | `/eno-remarcar` | Sem problema, a gente remarca. Temos {{disponibilidade_proxima}}. Qual fica melhor para você? |
| Pós-visita | `/eno-obrigado` | Foi ótimo receber vocês! Se quiser levar algo que provou aqui, é só me dizer — {{canal_de_venda_ao_consumidor}}. |

**De cadência.**

| Título | Atalho | Corpo | Revisar antes de publicar |
|---|---|---|---|
| Cadência · reserva confirmada | `/eno-reserva-1` | Sua reserva está confirmada. Anotei aqui o dia, o horário e o número de pessoas — qualquer mudança, é só me avisar por aqui. | — |
| Cadência · escolhendo data, 1º toque | `/eno-data-1` | Ainda quer marcar? Me diz um dia que funcione para você que eu vejo o que tenho aberto. | — |
| Cadência · escolhendo data, encerramento | `/eno-data-2` | Deixo o convite aberto. Quando quiser vir, me chama que eu encaixo. | — |
| Cadência · faltou, 1º toque | `/eno-faltou-1` | Sentimos sua falta hoje. Aconteceu alguma coisa? Se quiser, eu remarco. | — |
| Cadência · faltou, 2º toque | `/eno-faltou-2` | Quando der, me avisa que eu vejo uma data nova para vocês. | — |
| Cadência · pós-visita, 1º toque | `/eno-pos-1` | Obrigado pela visita! O que vocês mais gostaram de provar? | — |
| Cadência · pós-visita, 2º toque | `/eno-pos-2` | Se quiser repetir em casa, dá para comprar por aqui: {{canal_de_venda_ao_consumidor}}. | **sim** |

### 6. Cadências

**A. Antes da visita**

- Gatilho: *Mudança de etapa no funil* → Reserva confirmada
- Passo 1 — imediato → `/eno-reserva-1`
- Para quando: o contato respondeu · a visita mudou de etapa · pediu para parar

⚠️ **A véspera saiu da cadência, e não por gosto: o motor não sabe esperar até
uma data.** `waitConfigSchema` (`lib/followup/graph-schema.ts:86-104`) tem dois
modos e só dois — `fixed` (uma duração em milissegundos) e `smart` (uma faixa
mín./máx.). **Não existe espera relativa à data de um compromisso.** Um passo
"espera até a véspera" só poderia virar espera fixa a partir do *gatilho*, e o
gatilho aqui é a confirmação da reserva: quem confirma com dois meses de
antecedência receberia o "é amanhã!" dois meses antes da visita.

**Quem cobre a véspera é o lembrete do tipo de compromisso**, que é a peça que
conhece a data: `calendar_event_types.reminder_enabled`,
`reminder_minutes_before` e `reminder_extra_offsets_minutes` (a agenda dispara
pelo cron `app/api/v1/cron/agenda-reminder`). Os tipos *Visita guiada* e
*Degustação* desta jornada já nascem com `reminder_minutes_before` sugerido em
**1440 min (24 h)** — ver §7.

⚠️ **Mas o pacote NÃO liga o lembrete.** `reminder_enabled` nasce **falso**
(default da coluna desde a migration 0194) e a rota de criação declara
`reminder_enabled: z.boolean().optional()` **sem `.default(true)`**, com o motivo
escrito nela: *"Continua nascendo desligado… mandar mensagem para o telefone de
um cliente é irreversível"* (`app/api/v1/agenda/tipos/route.ts`, bloco
`camposDoTipo`). A véspera passa a sair **depois que a vinícola ligar o lembrete
na tela de Agenda** — e isso é a mesma regra pela qual as cadências nascem em
rascunho: o pacote prepara, a casa decide quando o telefone do cliente toca.

**B. Silêncio antes de marcar a data**

- Gatilho: *Silêncio* de 3 dias
- Passo 1 — **nó de condição**: `lead_stage` `eq` *Escolhendo data* — ramo *sim* segue, ramo *não* encerra
- Passo 2 — imediato → `/eno-data-1`
- Passo 3 — espera 4 dias → `/eno-data-2`
- Para quando: o contato respondeu · a visita mudou de etapa · pediu para parar

⚠️ **O gatilho de silêncio NÃO filtra por etapa**, e o rascunho deste anexo dizia
que sim. `trigger_config.params.segments` é interpretado como *overlap com as
TAGS do contato* (`contacts.tags`), não como etapa do funil — está escrito na
própria varredura: *"única primitiva de segmentação já modelada no schema é
`contacts.tags`"* (`lib/followup/silence-sweep.ts:36-39`, e o filtro em `:282`).
Um `segments: ["escolhendo_data"]` casaria contra tag nenhuma e a cadência
**varreria a organização inteira** — todo contato silencioso há 3 dias receberia
"ainda quer marcar?".

**A escolha, entre as duas saídas possíveis, é o nó de condição no grafo** (e não
trocar a etapa por uma tag): a etapa é o estado que a operação já mantém no
quadro, e depender de tag exigiria que alguém marcasse e desmarcasse o contato a
cada movimento de coluna — trabalho manual que envelhece em silêncio e faz a
cadência disparar para quem já marcou a visita. O nó de condição lê o estado real
no momento do disparo.

O nó é o `condition` (`lib/followup/graph-schema.ts:234-247`), com
`field: 'lead_stage'`, `op: 'eq'` e `value` = **o id da etapa**. O motor compara
por igualdade contra o `stage_id` do lead (`lib/followup/node-handlers.ts:294`,
alimentado por `lib/followup/engine.ts:770`), então o aplicador grava o **id real
da etapa desta organização** — nome ou slug cairia sempre no ramo *não*, em
silêncio.

**C. Não compareceu**

- Gatilho: *Falta confirmada pela equipe*
- Passo 1 — imediato → `/eno-faltou-1`
- Passo 2 — espera 3 dias → `/eno-faltou-2`
- Para quando: o contato respondeu · pediu para parar

**D. Depois da visita**

- Gatilho: *Mudança de etapa no funil* → Visita realizada
- Passo 1 — espera 1 dia → `/eno-pos-1`
- Passo 2 — espera 5 dias → `/eno-pos-2`
- Para quando: o contato respondeu · pediu para parar

### 7. Tipos de agenda

| Tipo | Categoria | Duração sugerida | Local | Lembrete sugerido |
|---|---|---|---|---|
| Visita guiada | Visita | 60 min | Presencial | 1440 min (24 h) — **desligado** |
| Degustação | Visita | 45 min | Presencial | 1440 min (24 h) — **desligado** |
| Visita + refeição | Visita | 180 min | Presencial | 1440 min (24 h) — **desligado** |
| Atendimento a agência ou grupo | Reunião | 30 min | Google Meet | — |

⚠️ **"Desligado" é o estado em que o tipo nasce, e é deliberado.**
`reminder_enabled` tem default `false` na coluna (migration 0194) e a rota de
criação **não** o liga (`reminder_enabled: z.boolean().optional()`, sem
`.default(true)` — `app/api/v1/agenda/tipos/route.ts`, bloco `camposDoTipo`). O
pacote grava a **antecedência sugerida** e deixa o interruptor com a vinícola:
ela liga na tela de Agenda quando quiser que o telefone do visitante toque.

A antecedência tem faixa própria na rota, **mais estreita que a do banco**: de
**15 min a 10.080 min (7 dias)**. O piso existe porque o cron roda a cada 5
minutos e abaixo de três ciclos uma rodada atrasada come a antecedência inteira;
o teto, porque 30 dias não é lembrete, é convite. Os 1440 min acima estão dentro
da faixa.

É esse lembrete — e não um passo de cadência — que cobre a **véspera da visita**
(cadência A desta jornada).

### 8. Perguntas frequentes (agente de IA)

1. **Que horas vocês abrem para visita?** {{horario_visitas}}. Trabalhamos com hora marcada.
2. **Quanto custa?** {{valor_da_visita}} por pessoa. {{o_que_inclui}}.
3. **Precisa agendar?** Precisa — assim garantimos guia e taças para o seu grupo.
4. **Posso levar crianças?** Pode. A degustação é só para maiores de 18 anos. {{politica_de_criancas_e_pets}}.
5. **É acessível para cadeirante?** {{acessibilidade}}.
6. **Como chego aí?** {{endereco_da_vinicola}}. {{orientacao_de_acesso}}.
7. **Posso cancelar?** Pode, conforme {{politica_de_cancelamento}}. É só avisar por aqui.
8. **Vocês atendem em outro idioma?** {{idiomas_atendidos}}.

### 9. Lacunas desta jornada

| Lacuna | O que a vinícola preenche |
|---|---|
| `{{nome_da_vinicola}}` | Nome usado no atendimento |
| `{{horario_visitas}}` | Dias e horários de visitação |
| `{{roteiro_da_visita}}` | O que o visitante faz e vê |
| `{{duracao_da_visita}}` | Tempo médio do roteiro |
| `{{valor_da_visita}}` | Valor por pessoa |
| `{{o_que_inclui}}` | O que está incluso (taças, rótulos, petisco) |
| `{{endereco_da_vinicola}}` | Endereço completo |
| `{{orientacao_de_acesso}}` | Estrada, estacionamento, referência |
| `{{politica_de_reserva}}` | Se exige sinal, confirmação, prazo |
| `{{tamanho_de_grupo}}` | A partir de quantas pessoas vira grupo |
| `{{condicoes_de_grupo}}` | Horário e condições para grupos |
| `{{politica_de_criancas_e_pets}}` | Regras para crianças e animais |
| `{{disponibilidade_proxima}}` | Datas livres do momento (o operador preenche) |
| `{{acessibilidade}}` | Estrutura para cadeirante e mobilidade reduzida |
| `{{politica_de_cancelamento}}` | Prazo e regra de cancelamento |
| `{{idiomas_atendidos}}` | Idiomas em que a casa recebe |
| `{{data_e_hora}}` | Preenchido na reserva |
| `{{numero_de_pessoas}}` | Preenchido na reserva |
| `{{canal_de_venda_ao_consumidor}}` | Onde o visitante compra depois |

---

## Jornada 3 — Clube de assinatura

### 1. Funil

**Nome:** Clube de assinatura

| Conceito | Palavra na tela |
|---|---|
| lead | Interessado |
| deal | Assinatura |
| won | Assinante ativo |
| lost | Não assinou |

| # | Nome curto | Slug | O que caracteriza um contato aqui |
|---|---|---|---|
| 1 | Interesse no clube | `interesse_no_clube` | `new` | Perguntou sobre o clube ou veio de uma ação do clube. |
| 2 | Explicando o clube | `explicando_o_clube` | `contacted` | Já recebeu como funciona: frequência, o que vem, como é cobrado. |
| 3 | Escolhendo o plano | `escolhendo_o_plano` | `qualifying` | Quer assinar e está decidindo plano, frequência ou perfil de vinho. |
| 4 | Plano escolhido | `plano_escolhido` | `qualified` | Fechou qual plano quer; falta concluir a adesão. |
| 5 | Aguardando adesão | `aguardando_adesao` | `negotiating` | Adesão em curso conforme `{{forma_de_adesao}}`; falta o pagamento ou o aceite entrar. |
| 6 | Assinante ativo | `assinante_ativo` | `won` | Adesão concluída — **ganho**. |
| 7 | Não assinou | `nao_assinou` | `lost` | Encerrado sem adesão — **perdido**, com motivo. |

As 5 etapas de trabalho cabem nas 5 dicas não-terminais: nenhuma fica sem dica.

**Por que *Plano escolhido* existe.** O rascunho deste anexo tinha 6 etapas, com
*Escolhendo o plano* indo direto a *Aguardando adesão* — e isso **reprovaria no
gate de cobertura**: sobravam 4 etapas de trabalho para 5 passos, `qualified`
ficava sem destino e `lib/onboarding/proposta-de-funil.test.ts:43-57` recusa
pacote com `faltando` não vazio. A etapa nova não é enchimento: ela separa duas
coisas que a operação do clube separa mesmo — *já sei qual plano ele quer* de
*a adesão está em curso* —, e é justamente entre as duas que mora a cadência A.

Retenção de quem já é assinante **não vira etapa**: vive na tag
`risco-cancelamento` mais a cadência C. Etapa depois do ganho quebraria a leitura
do quadro — ganho é terminal.

### 2. Motivos de perda

| Texto exato que o operador escolhe |
|---|
| Achou o valor alto |
| Não quer compromisso recorrente |
| Menor de 18 anos |
| Não entregamos na região dele |
| Já assina outro clube |
| Parou de responder |

### 3. Campos personalizados

| Rótulo | Chave | Tipo | Opções |
|---|---|---|---|
| Frequência desejada | `frequencia_desejada` | seleção | `mensal` Mensal · `bimestral` Bimestral · `trimestral` Trimestral · `ainda_nao_sabe` Ainda não sabe |
| Perfil de vinho preferido | `perfil_de_vinho` | múltipla seleção | `tinto` Tinto · `branco` Branco · `rose` Rosé · `espumante` Espumante · `sem_preferencia` Sem preferência |
| Consumo por mês (garrafas) | `consumo_mensal` | seleção | `1_a_2` 1 a 2 · `3_a_5` 3 a 5 · `6_a_11` 6 a 11 · `12_ou_mais` 12 ou mais |
| Cidade e UF de entrega | `cidade_uf_entrega` | texto | — |
| Já visitou a vinícola | `ja_visitou` | seleção | `sim` Sim · `nao` Não · `nao_informado` Não informado |
| Data de adesão | `data_de_adesao` | data | — |
| Origem do interesse | `origem_do_interesse` | seleção | `visita` Visita · `loja` Loja · `instagram` Instagram · `indicacao` Indicação · `site` Site · `outro` Outro |
| Quem recebe a caixa | `quem_recebe` | texto | — |

### 4. Tags

`clube` · `assinante-ativo` · `risco-cancelamento` · `pausa-solicitada` ·
`troca-de-plano` · `indicou-amigo` · `entrega-com-problema` · `renovacao`

### 5. Respostas rápidas

**Do operador.**

| Título | Atalho | Corpo |
|---|---|---|
| Explicar o clube | `/clube-explicar` | O clube funciona assim: {{como_funciona_o_clube}}. Você recebe {{o_que_vem_na_caixa}} a cada {{frequencia_do_clube}}. |
| Planos | `/clube-planos` | Temos estes planos: {{planos_do_clube}}. Qual faz mais sentido para o seu consumo? |
| Entrega | `/clube-entrega` | Entregamos em {{regioes_de_entrega}}, com prazo de {{prazo_de_entrega}}. {{regra_de_frete_do_clube}}. |
| Cobrança | `/clube-cobranca` | A cobrança é {{forma_de_cobranca}}, sempre {{dia_da_cobranca}}. Você recebe o aviso antes. |
| Adesão confirmada | `/clube-bem-vindo` | Bem-vindo ao clube, {{nome}}! Sua primeira caixa sai {{data_da_primeira_caixa}}. Qualquer coisa, fala comigo por aqui. |
| Pausar | `/clube-pausar` | Dá para pausar, sim: {{politica_de_pausa}}. Quer que eu registre a pausa a partir de quando? |
| Cancelar | `/clube-cancelar` | Entendo. O cancelamento funciona assim: {{politica_de_cancelamento_clube}}. Antes disso, quer tentar {{alternativa_ao_cancelamento}}? |
| Trocar o plano | `/clube-trocar` | Consigo trocar seu plano. Hoje você está em {{plano_atual}} — para qual você quer ir? |
| Indicação | `/clube-indicacao` | Se quiser indicar alguém, é só me passar o contato. {{beneficio_de_indicacao}}. |
| Problema na entrega | `/clube-problema` | Poxa, desculpa. Me manda uma foto e o número do pedido que eu resolvo — {{procedimento_de_ocorrencia}}. |

**De cadência.** Sem lacunas.

| Título | Atalho | Corpo |
|---|---|---|
| Cadência · adesão, 1º toque | `/clube-adesao-1` | Ficou alguma dúvida para fechar a assinatura? |
| Cadência · adesão, 2º toque | `/clube-adesao-2` | Se o que pesou foi a frequência, dá para começar num plano mais leve. Me diz o que funciona para você que eu ajusto. |
| Cadência · adesão, encerramento | `/clube-adesao-3` | Vou parar de insistir. O convite fica de pé quando você quiser. |
| Cadência · boas-vindas, 1º toque | `/clube-boas-vindas-1` | Bem-vindo ao clube! Já deixei seu cadastro certinho aqui. Qualquer coisa, é só falar comigo por aqui. |
| Cadência · boas-vindas, 2º toque | `/clube-boas-vindas-2` | Me conta: tem algum estilo que você prefere que eu registre na sua ficha? |
| Cadência · boas-vindas, 3º toque | `/clube-boas-vindas-3` | Chegou tudo certinho? O que você achou dos rótulos desta remessa? |
| Cadência · retenção, 1º toque | `/clube-retencao-1` | Vi que você pensou em sair do clube. Antes disso: o que não está funcionando para você? |
| Cadência · retenção, 2º toque | `/clube-retencao-2` | Se for a frequência ou o perfil dos vinhos, a gente ajusta. Me diz o que você prefere que eu vejo aqui. |

### 6. Cadências

**A. Interesse sem adesão**

- Gatilho: *Mudança de etapa no funil* → **Plano escolhido**
- Passo 1 — espera 1 dia → `/clube-adesao-1`
- Passo 2 — espera 4 dias → `/clube-adesao-2`
- Passo 3 — espera 10 dias → `/clube-adesao-3`
- Para quando: o contato respondeu · a assinatura mudou de etapa · pediu para parar

O gatilho é *Plano escolhido*, e não *Aguardando adesão*, porque é ali que mora a
dúvida que esta cadência resolve: o interessado já disse qual plano quer e ainda
não concluiu. Em *Aguardando adesão* a adesão **já está em curso** — insistir ali
seria cobrar quem está pagando. Quem sai de *Plano escolhido* para *Aguardando
adesão* encerra a cadência pela própria regra de parada ("a assinatura mudou de
etapa").

**B. Boas-vindas do assinante**

- Gatilho: *Mudança de etapa no funil* → Assinante ativo
- Passo 1 — imediato → `/clube-boas-vindas-1`
- Passo 2 — espera 3 dias → `/clube-boas-vindas-2`
- Passo 3 — espera 30 dias → `/clube-boas-vindas-3`
- Para quando: o contato respondeu · pediu para parar · passou para um humano

**C. Retenção**

- Gatilho: *Manual* (o operador inscreve quem recebeu a tag `risco-cancelamento`)
- Passo 1 — imediato → `/clube-retencao-1`
- Passo 2 — espera 3 dias → `/clube-retencao-2`
- Para quando: o contato respondeu · pediu para parar

### 7. Tipos de agenda

| Tipo | Categoria | Duração sugerida | Local |
|---|---|---|---|
| Degustação exclusiva de assinante | Visita | 60 min | Presencial |
| Encontro online de assinantes | Reunião | 60 min | Google Meet |
| Call de retenção | Call | 15 min | Telefone |
| Retirada do kit na vinícola | Visita | 15 min | Presencial |

### 8. Perguntas frequentes (agente de IA)

1. **O que vem na caixa?** {{o_que_vem_na_caixa}}, a cada {{frequencia_do_clube}}.
2. **Quanto custa?** {{planos_do_clube}}.
3. **Quando é cobrado?** {{forma_de_cobranca}}, {{dia_da_cobranca}}.
4. **Vocês entregam na minha cidade?** Entregamos em {{regioes_de_entrega}}. Me diz a cidade que eu confirmo.
5. **Posso escolher os rótulos?** {{politica_de_escolha_de_rotulos}}.
6. **Posso pausar ou cancelar?** Pode. {{politica_de_pausa}} / {{politica_de_cancelamento_clube}}.
7. **Quem recebe precisa ser maior de 18?** Sim — bebida alcoólica só pode ser recebida por maior de idade, com documento.
8. **Tem benefício para assinante na loja ou na visita?** {{beneficios_do_assinante}}.

### 9. Lacunas desta jornada

| Lacuna | O que a vinícola preenche |
|---|---|
| `{{como_funciona_o_clube}}` | Explicação curta do funcionamento |
| `{{o_que_vem_na_caixa}}` | Quantidade e tipo de itens por remessa |
| `{{frequencia_do_clube}}` | Periodicidade padrão |
| `{{planos_do_clube}}` | Nomes e valores dos planos |
| `{{plano_atual}}` | Preenchido pelo operador |
| `{{forma_de_adesao}}` | Como o interessado conclui a assinatura |
| `{{forma_de_cobranca}}` | Meio de cobrança recorrente |
| `{{dia_da_cobranca}}` | Quando cobra |
| `{{regioes_de_entrega}}` | Onde entrega |
| `{{prazo_de_entrega}}` | Em quanto tempo |
| `{{regra_de_frete_do_clube}}` | Quem paga o frete |
| `{{data_da_primeira_caixa}}` | Preenchido na adesão |
| `{{politica_de_pausa}}` | Regra de pausa |
| `{{politica_de_cancelamento_clube}}` | Regra de saída |
| `{{alternativa_ao_cancelamento}}` | O que oferecer antes de cancelar |
| `{{politica_de_escolha_de_rotulos}}` | Se o assinante escolhe ou é curadoria |
| `{{beneficio_de_indicacao}}` | Vantagem de indicar alguém |
| `{{beneficios_do_assinante}}` | Vantagens do assinante na loja e na visita |
| `{{procedimento_de_ocorrencia}}` | O que fazer em caixa quebrada ou extraviada |

---

## Jornada 4 — Vendas ao consumidor

Consumidor final e loja da vinícola.

### 1. Funil

**Nome:** Vendas ao consumidor

| Conceito | Palavra na tela |
|---|---|
| lead | Cliente |
| deal | Pedido |
| won | Pedido pago |
| lost | Não comprou |

| # | Nome curto | Slug | O que caracteriza um contato aqui |
|---|---|---|---|
| 1 | Novo contato | `novo_contato` | `new` | Chegou perguntando sobre vinho, preço ou entrega. |
| 2 | Entendendo o gosto | `entendendo_o_gosto` | `contacted` | Sabemos para que é (presente, consumo, evento) e o estilo que ele gosta. |
| 3 | Indiquei rótulos | `indiquei_rotulos` | `qualifying` | Recebeu sugestão de rótulos e valores. |
| 4 | Pedido montado | `pedido_montado` | `qualified` | Itens e quantidade fechados; falta pagar ou confirmar. |
| 5 | Aguardando pagamento | `aguardando_pagamento` | `negotiating` | Dados enviados; pagamento ainda não confirmado. |
| 6 | Pedido pago | `pedido_pago` | `won` | Pagamento confirmado — **ganho**. Entrega ou retirada segue fora do funil. |
| 7 | Não comprou | `nao_comprou` | `lost` | Encerrado sem compra — **perdido**, com motivo. |

As 5 etapas de trabalho cabem nas 5 dicas não-terminais: nenhuma fica sem dica.

### 2. Motivos de perda

| Texto exato que o operador escolhe |
|---|
| Achou caro |
| Menor de 18 anos |
| Não entregamos na região dele |
| Rótulo indisponível |
| Comprou em outro lugar |
| Parou de responder |

### 3. Campos personalizados

| Rótulo | Chave | Tipo | Opções |
|---|---|---|---|
| Ocasião | `ocasiao` | seleção | `presente` Presente · `consumo_proprio` Consumo próprio · `evento_ou_festa` Evento ou festa · `empresa` Empresa · `nao_informado` Não informado |
| Estilo preferido | `estilo_preferido` | múltipla seleção | `tinto_seco` Tinto seco · `tinto_suave` Tinto suave · `branco` Branco · `rose` Rosé · `espumante` Espumante · `frisante` Frisante · `suco_de_uva` Suco de uva |
| Entrega ou retirada | `entrega_ou_retirada` | seleção | `entrega` Entrega · `retirada_na_vinicola` Retirada na vinícola |
| Cidade e UF | `cidade_uf` | texto | — |
| Quantidade de garrafas | `quantidade_garrafas` | número | — |
| Data desejada | `data_desejada` | data | — |
| Maioridade confirmada | `maioridade_confirmada` | seleção | `sim` Sim · `nao` Não · `ainda_nao_perguntei` Ainda não perguntei |
| É assinante do clube | `e_assinante_do_clube` | seleção | `sim` Sim · `nao` Não · `nao_informado` Não informado |

### 4. Tags

`presente` · `retirada-na-vinicola` · `entrega` · `corporativo` ·
`primeira-compra` · `recompra` · `pedido-parado` · `menor-de-18`

### 5. Respostas rápidas

**Do operador.**

| Título | Atalho | Corpo |
|---|---|---|
| Boas-vindas | `/loja-ola` | Olá, {{nome}}! Aqui é a {{nome_da_vinicola}}. Me conta o que você procura — é para presentear ou para beber com alguém? |
| Indicação de rótulo | `/loja-indicacao` | Pelo que você me contou, eu iria de {{sugestao_de_rotulos}}. Quer que eu já separe? |
| Confirmar maioridade | `/loja-idade` | Antes de seguir, preciso confirmar: você é maior de 18 anos? Bebida alcoólica só pode ser vendida para maiores. |
| Entrega | `/loja-entrega` | Entregamos em {{regioes_de_entrega}}, prazo de {{prazo_de_entrega}}. {{regra_de_frete}}. |
| Retirada | `/loja-retirada` | Pode retirar aqui na vinícola, em {{endereco_da_vinicola}}, {{horario_da_loja}}. Só avisa o dia que eu deixo separado. |
| Pagamento | `/loja-pagamento` | Aceitamos {{formas_de_pagamento}}. Te mando os dados e assim que confirmar eu separo seu pedido. |
| Presente | `/loja-presente` | Para presente a gente cuida da apresentação: {{opcoes_de_presente}}. Quer incluir um cartãozinho? |
| Corporativo | `/loja-corporativo` | Para empresa a gente monta kits e faz personalização — {{condicoes_corporativas}}. Quantas unidades você precisa? |
| Retomada do pedido | `/loja-retomar` | {{nome}}, seu pedido está separado aqui. Quer que eu mantenha reservado? |
| Pós-venda | `/loja-pos-venda` | Chegou tudo certo? Se quiser repetir ou provar algo diferente, é só me chamar. |

**De cadência.** Sem lacunas.

| Título | Atalho | Corpo |
|---|---|---|
| Cadência · pedido parado, 1º toque | `/loja-parado-1` | Seu pedido está reservado aqui comigo. Quer que eu mantenha? |
| Cadência · pedido parado, 2º toque | `/loja-parado-2` | Vou liberar os itens se você não precisar mais — me avisa qualquer coisa. |
| Cadência · pós-venda, 1º toque | `/loja-pos-1` | Chegou tudo certo? |
| Cadência · pós-venda, 2º toque | `/loja-pos-2` | Se gostou, posso sugerir algo na mesma linha para a próxima. |
| Cadência · recompra | `/loja-recompra-1` | Oi! Faz um tempo. Quer uma sugestão nova ou repete o que você levou da última vez? |

### 6. Cadências

**A. Pedido parado**

- Gatilho: *Mudança de etapa no funil* → Aguardando pagamento
- Passo 1 — espera 1 dia → `/loja-parado-1`
- Passo 2 — espera 3 dias → `/loja-parado-2`
- Para quando: o contato respondeu · o pedido mudou de etapa · pediu para parar

**B. Depois da compra**

- Gatilho: *Mudança de etapa no funil* → Pedido pago
- Passo 1 — espera 3 dias → `/loja-pos-1`
- Passo 2 — espera 20 dias → `/loja-pos-2`
- Para quando: o contato respondeu · pediu para parar

**C. Recompra**

- Gatilho: *Manual* (o operador inscreve quem já comprou e está na hora de repor)
- Passo 1 — imediato → `/loja-recompra-1`
- Para quando: o contato respondeu · pediu para parar

⚠️ **Era *Silêncio* de 60 dias, e isso é irrecebível pelo motor.**
`threshold_minutes` é `z.number().int().min(5).max(10_080)`
(`lib/followup/api-schemas.ts`, kind `silence`) — o teto são **10.080 minutos, 7
dias**. 60 dias são 86.400 minutos: o fluxo seria recusado na validação, não
falharia bonito depois.

Reduzir para 7 dias **não** serve: sete dias de silêncio depois de uma compra não
é recompra, é o cliente ainda bebendo a primeira garrafa — a cadência chegaria
como cobrança. A recompra do consumidor passa a ser **manual**, exatamente como
a *Recompra do canal* da jornada 1, pelo mesmo motivo: quem sabe que chegou a
hora de repor é a pessoa que conhece o pedido, não um relógio de silêncio.

### 7. Tipos de agenda

| Tipo | Categoria | Duração sugerida | Local |
|---|---|---|---|
| Retirada na vinícola | Visita | 15 min | Presencial |
| Degustação na loja | Visita | 30 min | Presencial |
| Atendimento consultivo por vídeo | Reunião | 20 min | Google Meet |
| Entrega combinada | Outro | 30 min | Presencial |

### 8. Perguntas frequentes (agente de IA)

1. **Vocês entregam na minha cidade?** Entregamos em {{regioes_de_entrega}}, prazo de {{prazo_de_entrega}}. {{regra_de_frete}}.
2. **Quais as formas de pagamento?** {{formas_de_pagamento}}.
3. **Posso retirar aí?** Pode, em {{endereco_da_vinicola}}, {{horario_da_loja}}.
4. **Precisa ser maior de idade?** Sim. Vendemos e entregamos só para maiores de 18 anos, e a entrega é recebida com documento.
5. **Dá para mandar de presente?** Dá: {{opcoes_de_presente}}.
6. **E se a garrafa chegar quebrada?** {{procedimento_de_ocorrencia}}.
7. **Vocês emitem nota fiscal?** Sim, a nota acompanha o pedido.
8. **Qual vinho combina com {{prato}}?** Depende do estilo — me diz o prato que eu indico entre os nossos rótulos.

### 9. Lacunas desta jornada

| Lacuna | O que a vinícola preenche |
|---|---|
| `{{nome_da_vinicola}}` | Nome usado no atendimento |
| `{{sugestao_de_rotulos}}` | Preenchido pelo operador, ou pelo agente com a carta cadastrada |
| `{{regioes_de_entrega}}` | Onde entrega |
| `{{prazo_de_entrega}}` | Em quanto tempo |
| `{{regra_de_frete}}` | Política de frete |
| `{{endereco_da_vinicola}}` | Endereço da loja |
| `{{horario_da_loja}}` | Horário de funcionamento da loja |
| `{{formas_de_pagamento}}` | Meios aceitos |
| `{{opcoes_de_presente}}` | Embalagem, cartão, kit |
| `{{condicoes_corporativas}}` | Mínimo, personalização, prazo para empresas |
| `{{procedimento_de_ocorrencia}}` | O que fazer com produto quebrado ou extraviado |
| `{{prato}}` | Preenchido pela pergunta do cliente |

---

## Guardrail de maioridade (18+)

**Por que existe:** vender ou entregar bebida alcoólica a menor de 18 anos é
crime (Lei 13.106/2015, que alterou o ECA). O CRM não substitui a conferência de
documento na entrega — o guardrail cuida do que acontece na conversa.

⚠️ **O que entra NESTA entrega são três peças de conteúdo, e só elas:**

1. o motivo de perda **"Menor de 18 anos"** (jornadas 2, 3 e 4);
2. o campo **"Maioridade confirmada"** (`maioridade_confirmada`, jornada 4);
3. a tag **`menor-de-18`** (jornada 4).

⚠️ **A implementação do guardrail é fase futura.** Nada abaixo desta linha está
implementado, e nada abaixo desta linha é decisão fechada: o **texto de
encerramento** e o **comportamento** (bloqueio permanente ou reavaliação depois
de um prazo) são **decisão do dono, PENDENTE**. O que segue é material para essa
decisão, não especificação a construir.

**Quando a pergunta apareceria** (proposta):

- assim que a conversa vai para compra, degustação ou assinatura — nunca no "oi";
- uma vez por contato: confirmado, grava *Maioridade confirmada* = Sim e não pergunta de novo;
- também quando o contato diz algo que sugere menoridade (fala de escola, idade, "meus pais").

**Texto da pergunta** (proposta — este já existe como resposta rápida do
operador, `/loja-idade`):

> Antes de seguir, preciso confirmar: você é maior de 18 anos? Bebida alcoólica
> só pode ser vendida para maiores.

**O que mudaria no funil quando a pessoa diz que é menor** (proposta):

1. campo *Maioridade confirmada* = Não; tag `menor-de-18` no contato;
2. negócio marcado como perdido com o motivo **Menor de 18 anos**;
3. o agente de IA para de oferecer produto, preço e agendamento para esse contato;
4. qualquer cadência em andamento é encerrada, e o contato não entra em nova cadência de venda.

**Texto de encerramento — PENDENTE, decisão do dono** (a redação abaixo é
rascunho, não aprovada):

> Obrigado por avisar. Por lei, não posso vender nem oferecer bebida alcoólica
> para menores de 18 anos, então vou encerrar por aqui. Se for para um adulto da
> família, peça para ele falar comigo.

**Pontos que só o dono decide, e que mudam o texto acima:**

- se o contato marcado como menor fica bloqueado para sempre ou é reavaliado depois de um prazo;
- se o menor pode seguir na conversa para assuntos não alcoólicos (suco de uva, visita sem degustação);
- se um adulto do mesmo grupo pode assumir a compra, e como isso é registrado.

---

## O que NÃO incluímos, e por quê

| Não incluído | Motivo |
|---|---|
| Preço, valor de plano, valor de visita | Varia por vinícola e por safra — inventar aqui viraria promessa errada na tela do cliente. Fica como lacuna. |
| Nome de rótulo, safra, ficha técnica | É catálogo da vinícola. Entra pela base de conhecimento do agente, não pelo pacote. |
| Endereço, horário, telefone, CNPJ | Dado cadastral da casa. Lacuna. |
| Versão em espanhol ou inglês do conteúdo | Decisão do dono: só português. Texto de venda traduzido sem revisão de quem responde é promessa que ninguém conferiu. |
| Cálculo de frete e prazo por CEP | O produto não calcula frete. Prometer o cálculo no texto criaria expectativa que o CRM não cumpre. |
| Controle de estoque e reserva de garrafa | Não existe estoque no produto. "Está reservado" é fala do operador, não estado do sistema. |
| Evento com lotação, ingresso e lista | A agenda é compromisso 1:1 com o contato, não evento com vagas. Grupo é registrado em campo (*Número de pessoas*), não em capacidade controlada pelo sistema. |
| Cobrança, link de pagamento, status de pagamento | Não há integração de pagamento. A etapa *Aguardando pagamento* é marcada à mão. |
| Logística de entrega e rastreio | Fora do produto. O pós-venda pergunta se chegou; não consulta transportadora. |
| Programa de pontos e cupom | Exigiria regra e saldo que o produto não guarda. |
| Verificação documental de idade | O CRM registra a resposta do contato. Conferir documento é da equipe, na entrega ou na portaria. |
| Gatilho "compromisso concluído" | Não existe no produto e está fora desta entrega. As cadências usam *Mudança de etapa no funil* e *Falta confirmada pela equipe*. |
| Marcação de nome em mensagem de cadência | Medido: o envio de follow-up não resolve marcação nenhuma de contato, ela sairia literal. Ver *Por que cada passo de cadência também é uma resposta rápida*. |
| `{{contact.name}}` em qualquer lugar | A regex do composer não casa ponto (`lib/inbox/template-vars.ts:10`): essa marcação nunca é reconhecida. A do produto é `{{nome}}`. |
| As perguntas frequentes, como dado semeado | Não há tabela de FAQ no produto. Elas são **material da fase do agente de IA / base de conhecimento** e **não são semeadas nesta entrega** — ficam aqui redigidas para a fase seguinte não recomeçar do zero. |
| Implementação do guardrail de maioridade | Fase futura, e com decisão do dono pendente. Entram só o motivo de perda, o campo e a tag. |

---

## Decisões tomadas

As decisões do dono que este anexo aplica. Substituem as perguntas abertas do
rascunho.

| # | Decisão |
|---|---|
| 1 | **As 4 jornadas entram:** B2B/canal ("Canal e revenda"), Enoturismo ("Visitas e degustações"), Clube de assinatura e Consumidor final ("Vendas ao consumidor"). |
| 2 | **B2B mantém as 8 colunas**, com *Cadastro conferido* como etapa — não vira campo. |
| 3 | **Só português.** Não há versão em espanhol do conteúdo de vendas. |
| 4 | **Não existe gatilho "compromisso concluído".** Pós-visita e pós-venda usam *Mudança de etapa no funil* ou *Falta confirmada pela equipe*. Nenhum pedido de feature sai deste anexo. |
| 5 | **Cada passo de mensagem de cadência é também uma resposta rápida**, com título e atalho próprios, e a cadência referencia esse atalho. Atalhos únicos no pacote inteiro. |
| 6 | **Lacunas continuam `{{...}}`.** Num passo de cadência só valem lacunas que a vinícola preencheu antes na própria resposta rápida; lacuna de dado do momento não entra em mensagem automática. Onde um dado fixo da casa é imprescindível, a resposta rápida é marcada **"revisar antes de publicar a cadência"**. |
| 7 | **Fluxos de follow-up nascem em rascunho.** Publicar depende de agente de IA publicado, com follow-up ligado, e WhatsApp conectado. |
| 8 | **Clube: retenção por tag + cadência**, sem etapa depois do ganho. |
| 9 | **Guardrail de maioridade é fase futura.** Nesta entrega entram só o motivo de perda "Menor de 18 anos", o campo "Maioridade confirmada" e a tag `menor-de-18`. Texto de encerramento e comportamento (bloqueio permanente ou reavaliação) seguem **pendentes**, com o dono. |
| 10 | **Marcação de nome é `{{nome}}`.** `{{contact.name}}` não é reconhecida pelo composer (a regex não casa ponto) e sairia literal. Só respostas rápidas do operador usam nome; cadência nenhuma usa. |
| 11 | **Toda jornada tem as 5 dicas de passo não-terminais**, logo no mínimo 7 etapas. O clube ganhou *Plano escolhido* (`qualified`) por causa disso. O canal, com 6 etapas de trabalho, deixa `amostra_ou_degustacao` **sem dica** — que é estado válido, não pendência. |
| 12 | **Slug de etapa é derivado, não digitado.** O aplicador reusa `etapasParaGravar` + `slugDeNome`; os slugs deste anexo são informativos e o teste compara contra o derivado. |
| 13 | **Opção de campo de seleção é par `{ value, label }`**, com `value` = slug do rótulo. |
| 14 | **Tipo de compromisso tem UM local.** Onde o rascunho oferecia "Google Meet ou Presencial", vale **Google Meet**. |
| 15 | **Véspera da visita é lembrete do tipo de compromisso, não passo de cadência** — o motor não espera até uma data. E o lembrete **nasce desligado**: quem liga é a vinícola. |
| 16 | **Recompra do consumidor é manual.** Silêncio de 60 dias não existe no motor (teto de 7 dias), e 7 dias não é recompra. |
| 17 | **Silêncio não filtra por etapa** (`segments` casa tags). A jornada 2 usa um **nó de condição** por `lead_stage` no grafo, com o **id** da etapa. |
| 18 | **As perguntas frequentes não são semeadas nesta entrega** — são material da fase do agente de IA / base de conhecimento. |

---

## Inventário

Contagens por jornada. São elas que o teste de forma do plano confere contra o
corpo deste documento.

| Jornada | Etapas | Motivos de perda | Campos | Tags | Respostas rápidas | Cadências | Tipos de agenda | FAQs\* |
|---|---|---|---|---|---|---|---|---|
| Canal e revenda | 8 | 6 | 8 | 8 | 17 | 3 | 4 | 8 |
| Visitas e degustações | 7 | 6 | 8 | 8 | 17 | 4 | 4 | 8 |
| Clube de assinatura | 7 | 6 | 8 | 8 | 18 | 3 | 4 | 8 |
| Vendas ao consumidor | 7 | 6 | 8 | 8 | 15 | 3 | 4 | 8 |
| **Total** | **29** | **24** | **32** | **32** | **67** | **13** | **16** | **32** |

\* **As FAQs não são semeadas nesta entrega** (decisão 18). Estão contadas aqui
porque são conteúdo redigido e revisado, mas o destino delas é a fase do agente
de IA / base de conhecimento — nenhuma linha de banco sai desta coluna.

Cada jornada tem **exatamente uma** etapa de ganho e **exatamente uma** de
perdido — 4 e 4 no total, já contadas na coluna *Etapas*. Das 29 etapas, **21 são
de trabalho** (6 + 5 + 5 + 5) e **20 delas têm dica de passo**: a que não tem é
`amostra_ou_degustacao`, no canal.

Das 67 respostas rápidas, **40 são do operador** (10 por jornada) e **27 são
passos de cadência** (7 + 7 + 8 + 5). Os 27 passos de cadência distribuem-se
pelas 13 cadências, e **todos os 67 atalhos são únicos no pacote**.

Os 13 gatilhos, por tipo: **mudança de etapa** 7 · **manual** 3 · **silêncio** 2 ·
**falta confirmada pela equipe** 1. Os quatro têm motor; nenhum é
`conversation_end`, que o publish recusa.

O silêncio caiu de 3 para 2 quando a *Recompra* da jornada 4 virou manual — os
60 dias não cabiam no teto de 7 dias do gatilho.

Lacunas por jornada:

| Jornada | Lacunas |
|---|---|
| Canal e revenda | 14 |
| Visitas e degustações | 19 |
| Clube de assinatura | 19 |
| Vendas ao consumidor | 12 |
| **Total (com repetição entre jornadas)** | **64** |

**Uma** resposta rápida carrega lacuna dentro de mensagem automática e por isso
vem marcada **"revisar antes de publicar a cadência"**: `/eno-pos-2`. Nenhuma
outra jornada tem caso equivalente — as demais cadências saíram sem lacuna
nenhuma.

Eram duas enquanto `/eno-vespera` existia; ela saiu do pacote quando a véspera
deixou de ser passo de cadência e passou a ser lembrete do tipo de compromisso
(jornada 2, cadência A).
