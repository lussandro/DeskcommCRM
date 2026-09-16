---
impacto: nada_mudou
secao: corrigido
titulo: Documento grande na base de conhecimento termina de indexar
---

Um documento com mais de uns 2.400 trechos levava mais de dez minutos para indexar, e nesse
ponto o sistema achava que a indexação tinha travado: devolvia o trabalho à fila, outro processo
recomeçava do zero e o material nunca ficava pronto — cobrando os embeddings a cada volta. Agora
a indexação avisa que está viva a cada cem trechos, e só é reiniciada se parar de verdade.
