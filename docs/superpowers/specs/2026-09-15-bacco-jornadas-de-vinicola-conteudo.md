# Anexo — Pacote de conteúdo das jornadas de vinícola

> Anexo definitivo da spec das jornadas de vinícola do Bacco Adega CRM.
> Este arquivo é **conteúdo**, não código: descreve o que cada jornada semeia
> (funil, motivos de perda, campos, tags, respostas rápidas, cadências, tipos de
> agenda e FAQ). As decisões do dono já estão aplicadas — ver *Decisões tomadas*.

Quatro jornadas independentes. A vinícola escolhe no onboarding quais usa; cada
uma nasce completa e nenhuma depende das outras.

**Nada aqui inventa dado de vinícola nenhuma.** Todo valor que muda de casa para
casa está como `{{lacuna}}` e aparece listado na seção *Lacunas* de cada jornada.
Resposta rápida com lacuna não preenchida chega ao operador com a lacuna
**visível** — é o que `preencherModeloDeMensagem` devolve em `lacunas`
(`lib/operacao/modelos-de-mensagem.ts`). A lacuna é um lembrete, não um bug.

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
| Local do compromisso | Presencial · Telefone · WhatsApp · Link de vídeo · Google Meet | idem |

Slug de etapa neste anexo obedece `^[a-z0-9_-]{2,40}$`. Slug é único **dentro do
funil**, não entre funis — por isso `novo_contato` aparece em duas jornadas.

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
o modo `template` resolvem `{{contact.name}}` no envio automático. O corpo do
passo passa só por `interpolarVoltaDoPayload`
(`lib/agent-engine/agent/followup-turn.ts` → `resolveFlowSendBody`), que troca
exclusivamente `{{volta}}` e `{{voltas}}`. A função que conhece
`{{contact.name}}`, `{{nome}}`, `{{telefone}}` e `{{email}}` é `renderTemplate`
(`lib/automation/template.ts`), e ela **não tem chamador no caminho de
follow-up** — seus dois consumidores são a prévia do operador
(`lib/operacao/modelos-de-mensagem.ts`, que também alimenta o MCP) e a ação de
Webhooks (`lib/automation/actions/send-whatsapp.ts`).

**Consequência aplicada neste anexo:** nenhuma mensagem de cadência usa
`{{contact.name}}` — sairia literal no celular do cliente. As frases de cadência
foram reescritas para funcionar sem nome, o que também as deixa boas para quem
chegou sem nome cadastrado.

### Lacuna dentro de mensagem automática

Num passo de cadência só valem lacunas que a **vinícola preencheu previamente na
própria resposta rápida**. Lacuna de dado do momento — disponibilidade de hoje,
data combinada, resumo do pedido — **não entra em mensagem automática**: ninguém
vai preenchê-la antes do disparo, e ela sai literal.

Onde um dado fixo da vinícola é imprescindível dentro de um passo automático (o
endereço na véspera da visita, por exemplo), a resposta rápida vem marcada
**"revisar antes de publicar a cadência"** — a vinícola troca a lacuna pelo valor
dela antes de publicar o fluxo. São três no pacote inteiro, todas assinaladas na
tabela da jornada.

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

| # | Nome curto | Slug | O que caracteriza um contato aqui |
|---|---|---|---|
| 1 | Novo contato | `novo_contato` | Chegou pedindo tabela, representação ou condições, e ninguém falou com ele ainda. |
| 2 | Entendendo o canal | `entendendo_canal` | Sabemos que tipo de estabelecimento é, onde atua e o que já vende. |
| 3 | Cadastro conferido | `cadastro_conferido` | Dados de revenda conferidos conforme `{{exigencias_de_cadastro}}`; pode receber tabela. |
| 4 | Tabela enviada | `tabela_enviada` | Recebeu tabela e condições; está avaliando. |
| 5 | Amostra ou degustação | `amostra_ou_degustacao` | Pediu amostra, visita do representante ou degustação para a equipe dele. |
| 6 | Negociando pedido | `negociando_pedido` | Está discutindo mix, volume, prazo ou entrega de um pedido concreto. |
| 7 | Pedido fechado | `pedido_fechado` | Pedido confirmado pelo canal — **ganho**. |
| 8 | Não fechou | `nao_fechou` | Encerrado sem pedido — **perdido**, com motivo escolhido. |

São 6 etapas de trabalho + 1 de ganho + 1 de perdido. O dono decidiu manter as 8
colunas, com *Cadastro conferido* como etapa: no B2B de bebida, contato sem
cadastro de pessoa jurídica não pode receber tabela, e uma etapa que trava a
tabela é mais visível no quadro do que um campo que ninguém olha.

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
| Tipo de canal | `tipo_de_canal` | seleção | Distribuidor · Importador · Restaurante · Bar/wine bar · Hotel ou pousada · Empório ou loja · Supermercado · Outro |
| Região de atuação | `regiao_de_atuacao` | seleção | Norte · Nordeste · Centro-Oeste · Sudeste · Sul |
| Estado (UF) | `estado_uf` | texto | — |
| Volume estimado por mês (garrafas) | `volume_mensal_garrafas` | número | — |
| Rótulos de interesse | `rotulos_de_interesse` | múltipla seleção | Tinto · Branco · Rosé · Espumante · Frisante · Licoroso · Suco de uva · Sem álcool |
| Já revende vinho nacional | `revende_vinho_nacional` | seleção | Sim · Não · Não informado |
| Forma de recebimento | `forma_de_recebimento` | seleção | Entrega no estabelecimento · Retirada na vinícola · Transportadora do canal |
| Data do último pedido | `data_ultimo_pedido` | data | — |

### 4. Tags

`canal-b2b` · `distribuidor` · `restaurante` · `hotel` · `emporio` ·
`aguarda-amostra` · `pedido-recorrente` · `sem-cadastro-pj`

### 5. Respostas rápidas

**Do operador** — disparadas à mão na conversa.

| Título | Atalho | Corpo |
|---|---|---|
| Boas-vindas do canal | `/canal-ola` | Olá, {{contact.name}}! Aqui é a {{nome_da_vinicola}}. Que bom ter você por aqui. Me conta rapidinho: é restaurante, loja, distribuidora? E em que cidade vocês atuam? |
| Pedir dados de cadastro | `/canal-cadastro` | Para abrir o cadastro de revenda eu preciso de: {{exigencias_de_cadastro}}. Pode mandar por aqui mesmo que eu encaminho. |
| Enviar tabela | `/canal-tabela` | Segue nossa tabela para revenda. As condições de pedido são {{condicoes_comerciais}}. Qualquer dúvida sobre rótulo ou mix, me chama. |
| Pedido mínimo | `/canal-minimo` | Nosso pedido mínimo para revenda é {{pedido_minimo}}. Dá para montar mix entre os rótulos, não precisa fechar caixa de um só. |
| Amostra | `/canal-amostra` | Consigo providenciar amostra dentro da nossa política: {{politica_de_amostra}}. Me confirma o endereço de entrega e a quem devo endereçar? |
| Visita do representante | `/canal-visita` | Posso pedir para o nosso representante passar aí. A região é atendida {{agenda_do_representante}}. Que dia da semana funciona melhor para vocês? |
| Retomar proposta | `/canal-retomada` | {{contact.name}}, tudo certo por aí? Fico à disposição para ajustar o mix da proposta se ficou algo fora do que vocês vendem. |
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
| Reunião comercial | Reunião | 45 min | Google Meet ou Presencial |
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
| 1 | Novo interessado | `novo_interessado` | Perguntou sobre visita, degustação ou passeio; ainda sem data. |
| 2 | Tirando dúvidas | `tirando_duvidas` | Está perguntando horário, valor, o que inclui, como chega. |
| 3 | Escolhendo data | `escolhendo_data` | Quer vir; falta acertar dia, horário e número de pessoas. |
| 4 | Aguardando confirmação | `aguardando_confirmacao` | Data proposta; falta o interessado confirmar conforme `{{politica_de_reserva}}`. |
| 5 | Reserva confirmada | `reserva_confirmada` | Compromisso marcado na agenda, com data, horário e número de pessoas. |
| 6 | Visita realizada | `visita_realizada` | A visita aconteceu — **ganho**. |
| 7 | Não veio | `nao_veio` | Desistiu, não apareceu ou não deu para atender — **perdido**, com motivo. |

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
| Tipo de grupo | `tipo_de_grupo` | seleção | Casal · Família · Amigos · Sozinho · Corporativo · Agência ou operadora |
| Tem crianças no grupo | `tem_criancas` | seleção | Sim · Não · Não informado |
| Cidade de origem | `cidade_de_origem` | texto | — |
| Interesse | `interesse_na_visita` | múltipla seleção | Degustação · Tour no vinhedo · Tour na cantina · Refeição · Compra na loja · Evento privado |
| Idioma de preferência | `idioma_de_preferencia` | seleção | Português · Espanhol · Inglês |
| Como chegou até nós | `origem_do_contato` | seleção | Instagram · Google · Indicação · Agência · Já visitou antes · Outro |

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
| Boas-vindas da visita | `/eno-ola` | Olá, {{contact.name}}! Que bom que você quer conhecer a {{nome_da_vinicola}}. Me conta: para quantas pessoas e que dia você pensou? |
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
| Cadência · véspera da visita | `/eno-vespera` | É amanhã! Estamos em {{endereco_da_vinicola}}. {{orientacao_de_acesso}}. Está tudo certo com o número de pessoas? | **sim** |
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
- Passo 2 — espera até a véspera → `/eno-vespera`
- Para quando: o contato respondeu · a visita mudou de etapa · pediu para parar

**B. Silêncio antes de marcar a data**

- Gatilho: *Silêncio* de 3 dias, na etapa Escolhendo data
- Passo 1 — imediato → `/eno-data-1`
- Passo 2 — espera 4 dias → `/eno-data-2`
- Para quando: o contato respondeu · a visita mudou de etapa · pediu para parar

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

| Tipo | Categoria | Duração sugerida | Local |
|---|---|---|---|
| Visita guiada | Visita | 60 min | Presencial |
| Degustação | Visita | 45 min | Presencial |
| Visita + refeição | Visita | 180 min | Presencial |
| Atendimento a agência ou grupo | Reunião | 30 min | Google Meet |

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
| 1 | Interesse no clube | `interesse_no_clube` | Perguntou sobre o clube ou veio de uma ação do clube. |
| 2 | Explicando o clube | `explicando_o_clube` | Já recebeu como funciona: frequência, o que vem, como é cobrado. |
| 3 | Escolhendo o plano | `escolhendo_o_plano` | Quer assinar e está decidindo plano, frequência ou perfil de vinho. |
| 4 | Aguardando adesão | `aguardando_adesao` | Plano escolhido; falta concluir a adesão conforme `{{forma_de_adesao}}`. |
| 5 | Assinante ativo | `assinante_ativo` | Adesão concluída — **ganho**. |
| 6 | Não assinou | `nao_assinou` | Encerrado sem adesão — **perdido**, com motivo. |

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
| Frequência desejada | `frequencia_desejada` | seleção | Mensal · Bimestral · Trimestral · Ainda não sabe |
| Perfil de vinho preferido | `perfil_de_vinho` | múltipla seleção | Tinto · Branco · Rosé · Espumante · Sem preferência |
| Consumo por mês (garrafas) | `consumo_mensal` | seleção | 1 a 2 · 3 a 5 · 6 a 11 · 12 ou mais |
| Cidade e UF de entrega | `cidade_uf_entrega` | texto | — |
| Já visitou a vinícola | `ja_visitou` | seleção | Sim · Não · Não informado |
| Data de adesão | `data_de_adesao` | data | — |
| Origem do interesse | `origem_do_interesse` | seleção | Visita · Loja · Instagram · Indicação · Site · Outro |
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
| Adesão confirmada | `/clube-bem-vindo` | Bem-vindo ao clube, {{contact.name}}! Sua primeira caixa sai {{data_da_primeira_caixa}}. Qualquer coisa, fala comigo por aqui. |
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

- Gatilho: *Mudança de etapa no funil* → Aguardando adesão
- Passo 1 — espera 1 dia → `/clube-adesao-1`
- Passo 2 — espera 4 dias → `/clube-adesao-2`
- Passo 3 — espera 10 dias → `/clube-adesao-3`
- Para quando: o contato respondeu · a assinatura mudou de etapa · pediu para parar

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
| 1 | Novo contato | `novo_contato` | Chegou perguntando sobre vinho, preço ou entrega. |
| 2 | Entendendo o gosto | `entendendo_o_gosto` | Sabemos para que é (presente, consumo, evento) e o estilo que ele gosta. |
| 3 | Indiquei rótulos | `indiquei_rotulos` | Recebeu sugestão de rótulos e valores. |
| 4 | Pedido montado | `pedido_montado` | Itens e quantidade fechados; falta pagar ou confirmar. |
| 5 | Aguardando pagamento | `aguardando_pagamento` | Dados enviados; pagamento ainda não confirmado. |
| 6 | Pedido pago | `pedido_pago` | Pagamento confirmado — **ganho**. Entrega ou retirada segue fora do funil. |
| 7 | Não comprou | `nao_comprou` | Encerrado sem compra — **perdido**, com motivo. |

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
| Ocasião | `ocasiao` | seleção | Presente · Consumo próprio · Evento ou festa · Empresa · Não informado |
| Estilo preferido | `estilo_preferido` | múltipla seleção | Tinto seco · Tinto suave · Branco · Rosé · Espumante · Frisante · Suco de uva |
| Entrega ou retirada | `entrega_ou_retirada` | seleção | Entrega · Retirada na vinícola |
| Cidade e UF | `cidade_uf` | texto | — |
| Quantidade de garrafas | `quantidade_garrafas` | número | — |
| Data desejada | `data_desejada` | data | — |
| Maioridade confirmada | `maioridade_confirmada` | seleção | Sim · Não · Ainda não perguntei |
| É assinante do clube | `e_assinante_do_clube` | seleção | Sim · Não · Não informado |

### 4. Tags

`presente` · `retirada-na-vinicola` · `entrega` · `corporativo` ·
`primeira-compra` · `recompra` · `pedido-parado` · `menor-de-18`

### 5. Respostas rápidas

**Do operador.**

| Título | Atalho | Corpo |
|---|---|---|
| Boas-vindas | `/loja-ola` | Olá, {{contact.name}}! Aqui é a {{nome_da_vinicola}}. Me conta o que você procura — é para presentear ou para beber com alguém? |
| Indicação de rótulo | `/loja-indicacao` | Pelo que você me contou, eu iria de {{sugestao_de_rotulos}}. Quer que eu já separe? |
| Confirmar maioridade | `/loja-idade` | Antes de seguir, preciso confirmar: você é maior de 18 anos? Bebida alcoólica só pode ser vendida para maiores. |
| Entrega | `/loja-entrega` | Entregamos em {{regioes_de_entrega}}, prazo de {{prazo_de_entrega}}. {{regra_de_frete}}. |
| Retirada | `/loja-retirada` | Pode retirar aqui na vinícola, em {{endereco_da_vinicola}}, {{horario_da_loja}}. Só avisa o dia que eu deixo separado. |
| Pagamento | `/loja-pagamento` | Aceitamos {{formas_de_pagamento}}. Te mando os dados e assim que confirmar eu separo seu pedido. |
| Presente | `/loja-presente` | Para presente a gente cuida da apresentação: {{opcoes_de_presente}}. Quer incluir um cartãozinho? |
| Corporativo | `/loja-corporativo` | Para empresa a gente monta kits e faz personalização — {{condicoes_corporativas}}. Quantas unidades você precisa? |
| Retomada do pedido | `/loja-retomar` | {{contact.name}}, seu pedido está separado aqui. Quer que eu mantenha reservado? |
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

- Gatilho: *Silêncio* de 60 dias
- Passo 1 — imediato → `/loja-recompra-1`
- Para quando: o contato respondeu · pediu para parar

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
| `{{contact.name}}` em mensagem de cadência | Medido: o envio de follow-up não resolve essa marcação, ela sairia literal. Ver *Por que cada passo de cadência também é uma resposta rápida*. |
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

---

## Inventário

Contagens por jornada. São elas que o teste de forma do plano confere contra o
corpo deste documento.

| Jornada | Etapas | Motivos de perda | Campos | Tags | Respostas rápidas | Cadências | Tipos de agenda | FAQs |
|---|---|---|---|---|---|---|---|---|
| Canal e revenda | 8 | 6 | 8 | 8 | 17 | 3 | 4 | 8 |
| Visitas e degustações | 7 | 6 | 8 | 8 | 18 | 4 | 4 | 8 |
| Clube de assinatura | 6 | 6 | 8 | 8 | 18 | 3 | 4 | 8 |
| Vendas ao consumidor | 7 | 6 | 8 | 8 | 15 | 3 | 4 | 8 |
| **Total** | **28** | **24** | **32** | **32** | **68** | **13** | **16** | **32** |

Cada jornada tem **exatamente uma** etapa de ganho e **exatamente uma** de
perdido — 4 e 4 no total, já contadas na coluna *Etapas*.

Das 68 respostas rápidas, **40 são do operador** (10 por jornada) e **28 são
passos de cadência** (7 + 8 + 8 + 5). Os 28 passos de cadência distribuem-se
pelas 13 cadências, e **todos os 68 atalhos são únicos no pacote**.

Lacunas por jornada:

| Jornada | Lacunas |
|---|---|
| Canal e revenda | 14 |
| Visitas e degustações | 19 |
| Clube de assinatura | 19 |
| Vendas ao consumidor | 12 |
| **Total (com repetição entre jornadas)** | **64** |

Duas respostas rápidas carregam lacuna dentro de mensagem automática e por isso
vêm marcadas **"revisar antes de publicar a cadência"**: `/eno-vespera` e
`/eno-pos-2`. Nenhuma outra jornada tem caso equivalente — as demais cadências
saíram sem lacuna nenhuma.
