---
impacto: capacidade_nova
secao: adicionado
titulo: Integração com o Asaas — o assistente consulta e prorroga cobranças; cobrança vencida avisa o número principal
---

O módulo Asaas conecta o CRM à conta do cliente; ao ativar pela tela Configurações › Integrações › Asaas (admin), o agente ganha ferramentas para consultar pendências, vincular pagador e reemitir boleto dentro de limite declarado pelo admin. Quando uma cobrança vence, o Asaas avisa por webhook e o sistema matricula o contato (ou o número principal da empresa, se for B2B) num fluxo de retorno escolhido pelo admin, e cancela a matrícula quando paga. Módulo desligado = nenhuma ferramenta, nenhum webhook, nenhuma mudança no restante do CRM — é aditivo. O endereço de aviso (webhook URL + token) é cadastrado à mão no painel do Asaas. Crédito: @lussandro.
