---
impacto: exige_acao
secao: adicionado
titulo: Grupos de WhatsApp — ver e administrar pela tela
---

O CRM passa a enxergar os grupos de WhatsApp da organização: quem está neles, com que papel, e permite remover um participante direto pela tela, com auditoria de cada ação.

## Requer atenção

O WAHA só entrega os eventos de grupo se o webhook estiver inscrito neles. Quem já tem uma instalação precisa rodar update.sh para que o docker-compose.prod.yml (que ganhou os quatro eventos de grupo em WHATSAPP_HOOK_EVENTS) chegue ao servidor — sem isso a tela de grupos fica vazia, mesmo com os grupos existindo no WhatsApp.

Nada muda para quem não usa grupos: sem grupo vinculado, a tela fica só com o aviso de nenhum grupo ainda.
