---
impacto: capacidade_nova
secao: corrigido
titulo: A cobrança vencida fala pelo número certo quando a organização tem mais de um
---

Quem atende dois negócios na mesma organização — dois números de WhatsApp e uma conta só no Asaas — podia ver o financeiro de um negócio cobrando o cliente do outro. A integração aceitava **um** fluxo de retorno para cobrança vencida por organização, e ele era o de um dos números; a fatura vencida de qualquer cliente caía nesse mesmo fluxo.

Agora a tela do Asaas aceita **um fluxo por número**, e mostra ao lado de cada fluxo em qual número ele fala, ou o que há de errado com ele — o erro fica visível antes de acontecer, não depois, na conversa do cliente. Dois fluxos no mesmo número são recusados na hora de salvar, assim como fluxo armado por agentes de números diferentes e fluxo cujo número foi excluído.

Na hora de cobrar, o CRM escolhe o fluxo pelo número em que aquele cliente conversa. Cliente que ainda nunca escreveu continua sendo cobrado pelo único fluxo configurado, como antes. Mas cliente que conversa num número sem fluxo de cobrança NÃO é cobrado por outro número só porque ele é o único configurado. Quando há mais de um e o cliente não amarra a exatamente um número, **ninguém é disparado**: abre um aviso na Central apontando o cliente, para uma pessoa decidir. Adivinhar quem cobra é exatamente o defeito que esta correção fecha.

E a conversa da cobrança passa a nascer no número do fluxo escolhido. Antes ela nascia na conversa mais recente do cliente, de qualquer número: escolher o fluxo certo não bastava, porque a mensagem ainda podia sair pela linha errada.

Quem tem um número só segue como estava, e a configuração existente continua valendo sem nenhuma edição de arquivo. Uma exceção: se o número em que o agente do fluxo está publicado tiver sido EXCLUÍDO, a tela agora recusa esse fluxo e diz por quê, em vez de a cobrança falhar depois com um aviso críptico — publique o agente num número ativo.
