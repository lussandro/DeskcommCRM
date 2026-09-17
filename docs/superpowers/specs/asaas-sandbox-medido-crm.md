# Asaas sandbox medido — módulo Bacco (Task 0)

**Data da medição:** 2026-09-17. **Base:** `https://api-sandbox.asaas.com/v3`, header `access_token:
$ASAAS_API_KEY` (chave em `~/bacco-controle/apps/api/.env.bak-sandbox`, nunca impressa; ver nota de
segurança no fim). Responde às 5 perguntas de §3 da spec
(`docs/superpowers/specs/2026-09-17-bacco-asaas-design.md`).

**Gotcha de ambiente, achado ao carregar a chave:** o valor da variável começa com `$aact_...`. Um
`set -a; . arquivo.env; set +a` em bash **expande** esse `$aact_...` como parâmetro (variável
inexistente → string vazia), e o `access_token` sai vazio — Asaas devolve `401` com corpo vazio via
CloudFront, sem `errors[]`, o que parece "chave errada" mas é o shell interpretando o próprio valor.
A medição usou Python (`open(...).readline().split('=',1)[1]`) para extrair o valor sem passar por
expansão de shell. Quem for automatizar isso em produção (o módulo real não lê `.env` do disco, lê do
banco cifrado, então não é o mesmo caminho, mas o padrão do valor com `$` no início merece nota se
algum script de suporte tocar nele).

---

## 1. Cliente + cobrança vencida — `OVERDUE` na hora ou só depois do job noturno?

**Comando:**
```
POST $B/customers  {"name":"Teste CRM","cpfCnpj":"24971563792","mobilePhone":"51999990001"}
POST $B/payments   {"customer":"<id>","billingType":"BOLETO","value":10.0,"dueDate":"2026-09-01"}
```

**Resposta (cliente, 200):**
```json
{"object":"customer","id":"cus_000009140874","dateCreated":"2026-09-17","name":"Teste CRM",
 "mobilePhone":"51999990001","cpfCnpj":"24971563792","personType":"FISICA", ...}
```

**Resposta (cobrança com `dueDate` no passado, 2026-09-01 — HOJE é 2026-09-17):**
```json
400 {"errors":[{"code":"invalid_dueDate","description":"Não é permitido data de vencimento inferior a hoje."}]}
```

O sandbox **recusa a criação** de qualquer `payment` com `dueDate` anterior a hoje — não existe
"criar já vencida". Repeti com `dueDate` = hoje (`2026-09-17`): criou normalmente, `status: "PENDING"`
(não `OVERDUE`, mesmo no próprio dia do vencimento).

Tentei forçar via `PUT /payments/{id}` com `dueDate` no passado (`2026-09-10`) sobre essa cobrança
`PENDING`: mesmo erro `invalid_dueDate`. Ou seja, **não há nenhum caminho de API para colocar uma
cobrança em `OVERDUE` sinteticamente** — só passando o relógio real do `dueDate` (o dia seguinte ao
vencimento, presumivelmente por job noturno do Asaas, como o ERP já registrava em §3, mas isso **não
foi observado nesta sessão** porque não dá para esperar dias). Ficou como "não medido: quando o job
roda" — o que ficou medido e é novo é que **não existe atalho para simular vencida no sandbox**.

**Conclusão:** o sandbox não permite criar nem forçar via PUT uma cobrança já `OVERDUE` — `dueDate`
no passado é sempre `400 invalid_dueDate`, criação ou edição; a virada para `OVERDUE` só acontece
pela passagem real da data (não observada nesta sessão, dado o prazo).

---

## 2. `PUT dueDate` — status de retorno e `GET` seguinte

Como não foi possível colocar a cobrança em `OVERDUE` (pergunta 1), este passo testou o `PUT` sobre
uma cobrança `PENDING`, adiantando o vencimento para o futuro (a única direção que o sandbox aceita).

**Comando:**
```
PUT $B/payments/pay_xviarazysh1w6n73  {"dueDate":"2026-09-30"}
```

**Resposta (200):**
```json
{"id":"pay_xviarazysh1w6n73","status":"PENDING","dueDate":"2026-09-30","originalDueDate":"2026-09-17", ...}
```

`status` permanece `PENDING` e é devolvido no corpo da própria resposta do `PUT` (não precisou de
`GET` extra para conferir — o corpo já é o payment atualizado). `originalDueDate` fica congelado na
data original (`2026-09-17`), só `dueDate` muda.

**Conclusão:** `PUT dueDate` devolve o `payment` completo com o novo `status` já refletido (aqui,
`PENDING` → `PENDING`, sem mudança de estado); **não foi possível medir o caso `OVERDUE` → `PENDING`**
citado na spec, porque não há como produzir uma cobrança `OVERDUE` no sandbox sem esperar a data
vencer de verdade — registrar como "não medido", e a doutrina do ERP ("ler o status ao vivo antes de
agir") segue válida por isso mesmo.

---

## 3. `identificationField` e `pixQrCode` — BOLETO e PIX

**BOLETO** (`pay_xviarazysh1w6n73`):
```
GET $B/payments/{id}/identificationField → 200
{"identificationField":"46191110000000000000013289493010115850000001000","nossoNumero":"13289493","barCode":"..."}

GET $B/payments/{id}/pixQrCode → 200
{"success":true,"encodedImage":"<base64 redigido>","payload":"00020101021226820014br.gov.bcb.pix...","expirationDate":"2027-09-30 23:59:59"}
```

**PIX** (`pay_edx3hdxjuaouquws`):
```
GET $B/payments/{id}/identificationField → 400
{"errors":[{"code":"invalid_action","description":"Somente é possível obter linha digitável quando a forma de pagamento for boleto bancário."}]}

GET $B/payments/{id}/pixQrCode → 200
{"success":true,"encodedImage":"<base64 redigido>","payload":"00020101021226820014br.gov.bcb.pix...","expirationDate":"2027-09-17 23:59:59"}
```

**Achado que muda a suposição da spec (§3, item 3 — "provavelmente 404"):** `pixQrCode` responde
**200 em BOLETO também**, não só em PIX — todo boleto Asaas carrega um Pix copia-e-cola alternativo
(prática padrão do mercado desde 2023). `identificationField` (linha digitável) é que é exclusivo de
BOLETO e falha com **400** (não 404) e `code: "invalid_action"` quando chamado sobre um PIX.

**Conclusão:** `pixQrCode` funciona (200) para BOLETO e para PIX igualmente; `identificationField`
só existe para BOLETO e devolve `400 invalid_action` (não 404) para PIX — a ferramenta do agente
("manda linha digitável") tem que checar `billingType` antes de chamar, e o tratamento de erro é por
`code`, não por status HTTP.

---

## 4. Filtro `paymentDate[ge]` vs `dateCreated[ge]`, após `receiveInCash`

**Pagamento em dinheiro:**
```
POST $B/payments/pay_edx3hdxjuaouquws/receiveInCash  {"paymentDate":"2026-09-17","value":10.0}
→ 200 {"status":"RECEIVED_IN_CASH","paymentDate":"2026-09-17","clientPaymentDate":"2026-09-17", ...}
```

**Achado que muda a suposição da spec:** o status resultante é **`RECEIVED_IN_CASH`**, não
`RECEIVED`. `GET /payments?status=RECEIVED&paymentDate[ge]=2026-09-17` devolveu **zero resultados**
(`totalCount: 0`) mesmo com a cobrança paga naquele dia — porque o filtro de `status` é por valor
exato do vocabulário Asaas, e `RECEIVED` ≠ `RECEIVED_IN_CASH`.

```
GET $B/payments?status=RECEIVED&paymentDate[ge]=2026-09-17            → totalCount: 0
GET $B/payments?status=RECEIVED_IN_CASH&paymentDate[ge]=2026-09-17    → totalCount: 1 (a cobrança)
GET $B/payments?status=RECEIVED_IN_CASH&dateCreated[ge]=2026-09-17    → totalCount: 1 (a cobrança)
GET $B/payments?status=RECEIVED_IN_CASH&paymentDate[ge]=2026-09-18    → totalCount: 0 (amanhã — exclui)
```

O quarto teste (limite no dia seguinte) prova que `paymentDate[ge]` **filtra de verdade** — não é
parâmetro ignorado: valor coerente (hoje) inclui, valor incoerente (amanhã) exclui. Como
`dateCreated` e `paymentDate` coincidem nesta cobrança (criada e paga no mesmo dia), não deu para
diferenciar os dois campos entre si nesta sessão — os dois filtros bateram igual aqui porque as datas
são as mesmas, não porque sejam sinônimos.

**Conclusão:** `paymentDate[ge]` **existe e filtra** (confirmado por exclusão com data futura); mas
o vocabulário de `status` para "pago em dinheiro" é `RECEIVED_IN_CASH`, não `RECEIVED` — o filtro do
módulo real precisa cobrir os dois valores (e provavelmente `RECEIVED`, `CONFIRMED`,
`RECEIVED_IN_CASH` conforme o `billingType`), não só `RECEIVED`.

---

## 5. Webhooks

```
GET $B/webhooks → 200, totalCount: 6
```

A lista **não estava vazia**: 6 webhooks já cadastrados nesta conta sandbox, de outros projetos do
dono (`Bacco ERP`, `atendimento`/`chatcore-fila` do ChatCore, um endpoint `lovable`, um
`webhook.site` de outro teste). Pela regra de segurança da task ("não criar/modificar salvo lista
vazia"), **não criei, editei nem desabilitei nenhum webhook** — risco de derrubar integração viva de
outro sistema (o primeiro da lista, `Bacco ERP — baixa de cobranças`, está `enabled:true` e seria
afetado por qualquer teste de "url que responde 404" na mesma conta, já que o Asaas dispara **um
evento para cada webhook cadastrado com o evento assinado**, não por webhook escolhido na chamada).

Como consequência, os dois sub-testes que dependiam de criar/mexer em webhook **não foram medidos**:

- Envelope real de `PAYMENT_RECEIVED` via `webhook.site` — **não medido nesta sessão**. O formato
  segue sendo o que a doutrina já cita (`docs/superpowers/specs/asaas-sandbox-medido.md` do ERP) até
  alguém medir num ambiente isolado (conta sandbox própria do módulo, não uma compartilhada com
  produção de outros sistemas).
- `interrupted:true` após 404 repetido — **não medido nesta sessão**, mesmo motivo.

**Conclusão:** não dá para medir o comportamento de webhook com segurança nesta conta sandbox
compartilhada — ela já tem 6 webhooks de sistemas reais (inclusive um `enabled:true` de produção do
Bacco ERP); a medição do envelope `PAYMENT_RECEIVED` e do `interrupted:true` fica pendente de uma
conta sandbox dedicada ao módulo (ou de rodar isso já dentro da implementação, com webhook próprio
cadastrado pelo fluxo real de ativação, e não por este script solto).

---

## 6. Limpeza

```
DELETE $B/payments/pay_xviarazysh1w6n73 (BOLETO, PENDING)         → 200 {"deleted":true}
DELETE $B/payments/pay_edx3hdxjuaouquws (PIX, RECEIVED_IN_CASH)   → 200 {"deleted":true}
```

**Conclusão:** `DELETE` funcionou tanto em `PENDING` quanto em `RECEIVED_IN_CASH` — o sandbox não
bloqueou a exclusão de uma cobrança já paga (em produção real isso pode ter restrição diferente; não
medido aqui, só sandbox). O `customer` de teste (`cus_000009140874`) foi deixado no ar — o sandbox
não tem custo e apagar cliente não fazia parte do escopo pedido.

---

## Consequências para o plano

1. **§3 item 3 da spec estava errado**: `pixQrCode` NÃO é exclusivo de PIX — funciona (200) também
   para BOLETO. Quem está errado em não existir é `identificationField` sobre PIX, e o erro é
   `400 invalid_action`, não 404. Qualquer client/tool do módulo precisa tratar por `code` do corpo
   de erro, não por status HTTP puro, e não pode assumir 404 como "não aplicável".

2. **Vocabulário de status "pago" muda**: `receiveInCash` produz `RECEIVED_IN_CASH`, não `RECEIVED`.
   O consumidor de webhook e qualquer filtro/reconciliação (`reconcile.ts`, §9 da spec) que procura
   "pago" precisa cobrir a família de status de pagamento (`RECEIVED`, `CONFIRMED`,
   `RECEIVED_IN_CASH`, e possivelmente outros do PIX/cartão), não só o literal `RECEIVED`.

3. **`paymentDate[ge]` existe e filtra de verdade** — confirmado pela exclusão ao mover o limite para
   o dia seguinte. A suposição da spec ("o ERP só usou `dateCreated`, que é criação") pode ser
   substituída por `paymentDate[ge]` onde o módulo precisar filtrar por data de pagamento em vez de
   criação. Não foi possível diferenciar os dois campos entre si (coincidiram nesta medição), mas o
   parâmetro em si não é ignorado pela API.

4. **Não existe atalho de API para simular `OVERDUE`** — nem na criação (`dueDate` passado → `400
   invalid_dueDate`) nem via `PUT` sobre uma cobrança existente. A Task 11 (E2E) **precisa mesmo**
   criar a cobrança um dia antes (ou mais) e rodar o teste depois que a data vencer de verdade — não
   há como forçar isso no mesmo dia, nem no sandbox. Isso é mais restritivo do que a spec cogitava
   ("se só depois, criar um dia antes" — confirmado que é sempre "só depois", sem meio-termo).

5. **Webhook — pergunta em aberto, não fechada**: o envelope exato de `PAYMENT_RECEIVED` e o
   comportamento de `interrupted:true` após 404 continuam **não medidos**, porque esta conta sandbox
   já tem webhooks de produção de outros sistemas do dono e a regra de segurança da task proibiu
   mexer neles. Antes de fechar o §7 da spec (o Zod do envelope), alguém precisa medir isso numa
   conta isolada — não dá para confiar apenas na doc pública da Asaas para o formato exato.

6. **`DELETE` não distingue status** neste sandbox — apagou tanto `PENDING` quanto `RECEIVED_IN_CASH`
   sem erro. Se o módulo real quiser impedir exclusão de cobrança já paga, o guard tem que ser do
   próprio CRM (checar `status` antes de chamar `DELETE`), porque o Asaas sandbox não impôs essa
   trava.
