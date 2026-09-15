# Copy de outros setores — conferência depois da Task 6 (2026-09-15)

Plano 1 v2.1, Task 6 Step 6.

```
$ grep -rnIE "paciente|cl[ií]nica|odontol|corretor|imobili|e-?commerce|iPhone|Perfume" app components lib \
    --include=*.ts --include=*.tsx | grep -vE "\.test\.|/design/" | wc -l
164
```

## Trocado nesta task (texto visível)

| Onde | Antes | Depois |
|---|---|---|
| `app/onboarding/welcome/_form.tsx` (ajuda do nome) | "Pode ser clínica, loja, escritório — o que for seu." | "Pode ser o nome da vinícola, da adega ou da loja." |
| `app/onboarding/welcome/_form.tsx` (placeholder) | "Ex.: clínica odontológica, ou venda de roupa fitness pelo WhatsApp" | "Ex.: vinícola com loja própria, venda para restaurantes e visitas com degustação" |
| `app/app/agenda/_client.tsx` (motivo de remarcação) | "O paciente pediu…" | "O cliente pediu…" |
| `app/app/products/_client.tsx` | — | convenção de nome do vinho (safra, uva, volume) |
| `app/api/v1/products/import/route.ts` (planilha modelo) | iPhone / Perfume | Malbec Reserva 2021 750ml / Espumante Brut 750ml |
| `app/actions/onboarding/createDefaultAgent.ts` | prompts genéricos | + `REGRA_DA_ADEGA` (só rótulo do catálogo; visita confirmada pela equipe) |

Todas com entrada `es` em `lib/i18n/dicionario.ts` (`i18n-espanhol-cobre-a-tela.test.ts` verde).

## O que sobrou, classificado

| Classe | Onde | Destino |
|---|---|---|
| **Id técnico** | `ecommerce_friendly`/`ecommerce_professional` em `app/onboarding/setup-ai/_form.tsx`, `lib/schemas/onboarding.ts`, `app/actions/onboarding/createDefaultAgent.ts` — valor de `PromptTemplate` gravado em versão de agente; o rótulo na tela já é neutro | fica |
| **Comentário** | todas as demais ocorrências em `app/` e `components/` (histórico de decisões do upstream: "dono da clínica", PR #418, funil de e-commerce semeado) | fica |
| **Dado de vitrine interna** | `app/vitrine-agenda/_client.tsx:233` (`ana@clinica.com`, e-mail fictício do showcase de agenda) | fica |
| **Vocabulário de detecção / lógica** | `lib/opt-out/deteccao.ts` (corpus de frases de nicho), `lib/catalogo/busca.ts`, `lib/agenda/*`, `lib/leads/*`, `lib/agent-engine/*` | fica |

## Captação

```
$ grep -rnIiE "paciente|cl[ií]nica|imobili|corretor|odonto|dentist|im[óo]ve(l|is)" \
    app/app/webhooks app/app/ads app/app/leads app/app/contacts app/app/integrations | wc -l
0
```

Webhooks, RD Station, planilha de leads, anúncios, contatos e integrações: nenhum texto de outro setor.
