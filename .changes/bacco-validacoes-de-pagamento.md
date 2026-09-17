---
impacto: nada_mudou
secao: corrigido
titulo: O agente não afirma ter recebido comprovante nem confirma/libera pagamento — e chama uma pessoa quando fica sem resposta
---

Antes, o assistente respondia "recebi sim, deixo o comprovante registrado" para um cliente que disse ter mandado o comprovante e não mandou nada — e prometia registrar, confirmar ou liberar acesso, três coisas que ele não faz (a baixa e a liberação são automáticas). Proibir isso no prompt não bastou: foi medido acontecendo de novo com a proibição escrita. Agora duas conferências fixas barram essas frases antes de saírem, sem custo e sem consulta extra ao modelo, e elas aparecem no Painel de Segurança. Como consequência dessas conferências, uma resposta pode acabar sem nenhuma versão aprovada; nesse caso o atendimento não fica mudo: abre um chamado humano na Central e o cliente recebe o aviso de que uma pessoa vai continuar. E a regra mais dura: o assistente só concorda com uma cobrança quando consulta as cobranças e ela volta como paga — palavra do cliente e comprovante não valem; se o cliente afirma que pagou e a cobrança não consta paga, nenhuma resposta sai antes de abrir um chamado para o financeiro conferir. Nada precisa ser configurado. Crédito: @lussandro.
