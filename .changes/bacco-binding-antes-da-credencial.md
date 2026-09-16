---
impacto: nada_mudou
secao: corrigido
titulo: A escolha do painel de provedores vale mesmo quando a organização não tem chave do provedor padrão
---

Uma organização configurada como Anthropic sem chave Anthropic, mas com um ponto de IA (o
classificador do roteador, por exemplo) apontado para a OpenAI no painel de provedores, não
recebia resposta nenhuma: a chamada morria com "org sem credencial LLM utilizável" antes de o
painel ser consultado. Agora, quando o provedor padrão da organização não tem credencial, a
chamada sai pelo provedor que o painel escolheu para aquele ponto. Sem escolha no painel, o
erro continua o mesmo — a organização precisa mesmo de uma credencial.
