# Revisão — prova em tela das jornadas de vinícola

Rodada final contra a **candidata** `c3aa93ec` em `https://adega-crm.baccosistemas.com.br`
(2026-09-16), com a conta de QA, no contêiner `mcr.microsoft.com/playwright:v1.63.0-noble` da VPS:
**1 passed**, 12 capturas, medidas em `evidence/bacco-jornadas/jornadas-medidas.jsonl`.

A prova rodou **antes** da tag, como manda a doutrina de QA visual: achado em tela vira conserto
antes de lançar, não release nova depois.

## O que foi provado, pela tela

| Medida | Resultado |
|---|---|
| Porta na navegação | chega-se a `/app/settings/tenant/jornadas` clicando, não pela URL |
| Aviso de rascunho | visível antes de qualquer clique: "As cadências entram como rascunho… agente de IA publicado… WhatsApp conectado" |
| Ativar as quatro jornadas | 200 nas quatro (662 a 1454 ms), cada uma com "Esta jornada está ativada · 16/09/2026" |
| Reaplicar | segunda aplicação de *Canal e revenda* sem duplicar: a lista segue com um funil de cada nome |
| Quadro | 8 · 7 · 7 · 7 colunas, **na ordem de cada jornada** |
| Resposta rápida | `/canal-ola`, `/eno-ola`, `/clube-explicar` e `/loja-ola` oferecem o título e o corpo certos no atendimento |
| Tipos de compromisso | os quatro de cada jornada na Agenda, incluindo "Visita do representante · Presencial · No estabelecimento do cliente" |
| Cadências | as quatro primeiras listadas com o selo **Rascunho** |
| API × tela | `api_message_templates`: 200 com 67 modelos, ao lado do que o menu exibe |

## Capturas

`evidence/bacco-jornadas/jornadas-jornadas-light.png`, `evidence/bacco-jornadas/jornadas-jornadas-dark.png`,
`evidence/bacco-jornadas/jornadas-relatorio-light.png`, `evidence/bacco-jornadas/jornadas-reaplicacao-light.png`,
`evidence/bacco-jornadas/jornadas-quadro-light.png`, `evidence/bacco-jornadas/jornadas-quadro-dark.png`,
`evidence/bacco-jornadas/jornadas-resposta-rapida-light.png`, `evidence/bacco-jornadas/jornadas-resposta-rapida-dark.png`,
`evidence/bacco-jornadas/jornadas-agenda-light.png`, `evidence/bacco-jornadas/jornadas-agenda-dark.png`,
`evidence/bacco-jornadas/jornadas-cadencias-light.png`, `evidence/bacco-jornadas/jornadas-cadencias-dark.png`.

## O que a prova encontrou (e o que era falso alarme)

**Defeito de produto, corrigido antes da tag** — `35960b90`: a tela de Agenda lia
`calendar_event_types.location_details` e **nunca o renderizava**. "Presencial" não distinguia a
visita na vinícola da visita no estabelecimento do cliente. Nenhum teste de unidade veria isso; só a
tela. Depois do conserto, a medida `agenda` passou a registrar "Presencial · No estabelecimento do
cliente", e a expectativa fica como catraca contra regressão.

**Três falsos positivos, cada um derrubado por medição:**

1. **Colunas do quadro vazias** — não era seletor errado: `waitForLoadState("networkidle")` volta na
   hora numa navegação de SPA, e o quadro é buscado no cliente. A spec media antes de a tela pintar.
2. **Menu de respostas rápidas vazio** — a inbox **não pede os modelos ao abrir**; a busca só sai
   quando o `Composer` monta, ao selecionar a conversa. Até ela voltar, o menu já renderiza "Nenhum
   template. Crie em Configurações.", que é estado de carregamento, não de ausência.
3. **Antes disso, descartados um a um:** cache (`staleTime`), permissão (`message-templates.view`
   exige `agent`, a conta é `admin`), RLS (com `set_config` como o usuário QA o banco devolve 67),
   filtro do atalho (`resolveSlash` tira a barra e o filtro usa `includes`), envelope da API
   (`readBodySafe` devolve o JSON cru) e provedor de consultas (é único).

## Pré-condição semeada, e removida

A organização de QA não tinha canal nem conversa, e a prova precisa de uma para exercitar a resposta
rápida no atendimento. Com aprovação do dono, foram semeados **só na organização de QA** um canal de
prova, um contato e uma conversa; ao fim, os três foram removidos (conferido: 0 conversas, 0 contatos,
0 canais). Os 5 funis criados pela prova permanecem, porque são o efeito que se queria provar.

## Living System Checklist — Jornadas de vinícola

**Quem me alimenta?** Duas entradas reais: `app/actions/onboarding/montarQuadro.ts` (a vinícola marca
as jornadas no wizard) e `app/actions/settings/aplicarJornadaDeVinicola.ts` (a tela, depois). As duas
chamam `aplicarJornada()`, único caminho para o banco.

**Quem eu alimento?** Cinco consumidores que já existiam e passam a ter conteúdo: `crm_pipelines`/
`crm_stages` → o quadro; `message_templates` → o menu de respostas rápidas do atendimento;
`calendar_event_types` → a Agenda; `followup_flow_pointers` → o construtor de fluxos;
`crm_pipelines.settings` → campos e motivos de perda na ficha do lead.

**Que log eu emito?** `api_audit_log`, por peça (`pipeline.created`, `pipeline.stage_created`,
`template.created`, `agenda.tipo_criado`, `followup_flow.created`) mais a linha da aplicação inteira,
`vertical.jornada_aplicada`, com jornada, versão do pacote e relatório por peça.

**Onde apareço na tela?** `/app/settings/tenant/jornadas`, com os três estados lidos do ledger — e o
painel de auditoria recebe a ação nova sem ninguém mexer nele, porque a lista é derivada de
`AUDIT_ACTIONS`.

**Por qual porta se chega?** `lib/navigation/catalogo.ts`, grupo `organizacao`, seção "Sua empresa",
papel mínimo gerente; a ação de aplicar exige administrador.

**Mecanismo anti-morte:** o ledger em `organizations.settings.bacco_jornadas` guarda id e chave de
cada peça. Reaplicar não duplica, o que a vinícola apagou não volta, e jornada aplicada pela metade
lê como **parcial**, não como pronta.

**Laço de retorno:** quando a aplicação falha no meio, o relatório volta com a peça em `falhou` e o
texto real do banco, e a tela mostra a linha; peça que já existia com outro conteúdo aparece como
`nao_verificada`, em vez de ser afirmada como configurada.

**Mapa vivo:** `docs/architecture/jornadas-de-vinicola.architecture.json`, com nós e arestas reais,
validado por `tests/unit/mapas-de-arquitetura.test.ts`.

## Aprovação do dono

- Capturas da prova final: **aprovadas** pelo dono em 2026-09-16, autorizando o corte da `v26.9.4`.
