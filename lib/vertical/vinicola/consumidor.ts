/**
 * Jornada 4 — Vendas ao consumidor (consumidor final e loja da vinícola).
 *
 * Texto copiado do anexo da spec, §"Jornada 4 — Vendas ao consumidor". Qualquer
 * mudança de conteúdo muda o anexo PRIMEIRO; este arquivo o segue.
 *
 * ⚠️ A *Recompra* é MANUAL, e não silêncio. Silêncio de 60 dias é irrecebível
 * pelo motor (`threshold_minutes` tem teto de 10.080 min = 7 dias), e reduzir
 * para 7 dias não serve: uma semana depois da compra o cliente ainda está na
 * primeira garrafa, e a cadência chegaria como cobrança. Quem sabe que é hora
 * de repor é a pessoa que conhece o pedido, não um relógio de silêncio.
 */
import type { JornadaDeVinicola } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;

export const CONSUMIDOR: JornadaDeVinicola = {
  comoSeApresenta: "Vender direto ao consumidor final e pela loja da vinícola",
  nomeDoFunil: "Vendas ao consumidor",
  vocabulario: { lead: "Cliente", deal: "Pedido", won: "Pedido pago", lost: "Não comprou" },
  etapas: [
    { nome: "Novo contato", passo: "new" },
    { nome: "Entendendo o gosto", passo: "contacted" },
    { nome: "Indiquei rótulos", passo: "qualifying" },
    { nome: "Pedido montado", passo: "qualified" },
    { nome: "Aguardando pagamento", passo: "negotiating" },
    { nome: "Pedido pago", passo: "won" },
    { nome: "Não comprou", passo: "lost" },
  ],
  motivosDePerda: [
    "Achou caro",
    "Menor de 18 anos",
    "Não entregamos na região dele",
    "Rótulo indisponível",
    "Comprou em outro lugar",
    "Parou de responder",
  ],
  campos: [
    {
      key: "ocasiao",
      label: "Ocasião",
      type: "select",
      options: [
        { value: "presente", label: "Presente" },
        { value: "consumo_proprio", label: "Consumo próprio" },
        { value: "evento_ou_festa", label: "Evento ou festa" },
        { value: "empresa", label: "Empresa" },
        { value: "nao_informado", label: "Não informado" },
      ],
    },
    {
      key: "estilo_preferido",
      label: "Estilo preferido",
      type: "multiselect",
      options: [
        { value: "tinto_seco", label: "Tinto seco" },
        { value: "tinto_suave", label: "Tinto suave" },
        { value: "branco", label: "Branco" },
        { value: "rose", label: "Rosé" },
        { value: "espumante", label: "Espumante" },
        { value: "frisante", label: "Frisante" },
        { value: "suco_de_uva", label: "Suco de uva" },
      ],
    },
    {
      key: "entrega_ou_retirada",
      label: "Entrega ou retirada",
      type: "select",
      options: [
        { value: "entrega", label: "Entrega" },
        { value: "retirada_na_vinicola", label: "Retirada na vinícola" },
      ],
    },
    { key: "cidade_uf", label: "Cidade e UF", type: "text" },
    { key: "quantidade_garrafas", label: "Quantidade de garrafas", type: "number" },
    { key: "data_desejada", label: "Data desejada", type: "date" },
    {
      key: "maioridade_confirmada",
      label: "Maioridade confirmada",
      type: "select",
      options: [
        { value: "sim", label: "Sim" },
        { value: "nao", label: "Não" },
        { value: "ainda_nao_perguntei", label: "Ainda não perguntei" },
      ],
    },
    {
      key: "e_assinante_do_clube",
      label: "É assinante do clube",
      type: "select",
      options: [
        { value: "sim", label: "Sim" },
        { value: "nao", label: "Não" },
        { value: "nao_informado", label: "Não informado" },
      ],
    },
  ],
  tags: [
    "presente",
    "retirada-na-vinicola",
    "entrega",
    "corporativo",
    "primeira-compra",
    "recompra",
    "pedido-parado",
    "menor-de-18",
  ],
  respostasRapidas: [
    {
      titulo: "Boas-vindas",
      atalho: "/loja-ola",
      corpo:
        "Olá, {{nome}}! Aqui é a {{nome_da_vinicola}}. Me conta o que você procura — é para presentear ou para beber com alguém?",
    },
    {
      titulo: "Indicação de rótulo",
      atalho: "/loja-indicacao",
      corpo: "Pelo que você me contou, eu iria de {{sugestao_de_rotulos}}. Quer que eu já separe?",
    },
    {
      titulo: "Confirmar maioridade",
      atalho: "/loja-idade",
      corpo:
        "Antes de seguir, preciso confirmar: você é maior de 18 anos? Bebida alcoólica só pode ser vendida para maiores.",
    },
    {
      titulo: "Entrega",
      atalho: "/loja-entrega",
      corpo: "Entregamos em {{regioes_de_entrega}}, prazo de {{prazo_de_entrega}}. {{regra_de_frete}}.",
    },
    {
      titulo: "Retirada",
      atalho: "/loja-retirada",
      corpo:
        "Pode retirar aqui na vinícola, em {{endereco_da_vinicola}}, {{horario_da_loja}}. Só avisa o dia que eu deixo separado.",
    },
    {
      titulo: "Pagamento",
      atalho: "/loja-pagamento",
      corpo:
        "Aceitamos {{formas_de_pagamento}}. Te mando os dados e assim que confirmar eu separo seu pedido.",
    },
    {
      titulo: "Presente",
      atalho: "/loja-presente",
      corpo:
        "Para presente a gente cuida da apresentação: {{opcoes_de_presente}}. Quer incluir um cartãozinho?",
    },
    {
      titulo: "Corporativo",
      atalho: "/loja-corporativo",
      corpo:
        "Para empresa a gente monta kits e faz personalização — {{condicoes_corporativas}}. Quantas unidades você precisa?",
    },
    {
      titulo: "Retomada do pedido",
      atalho: "/loja-retomar",
      corpo: "{{nome}}, seu pedido está separado aqui. Quer que eu mantenha reservado?",
    },
    {
      titulo: "Pós-venda",
      atalho: "/loja-pos-venda",
      corpo: "Chegou tudo certo? Se quiser repetir ou provar algo diferente, é só me chamar.",
    },
    {
      titulo: "Cadência · pedido parado, 1º toque",
      atalho: "/loja-parado-1",
      corpo: "Seu pedido está reservado aqui comigo. Quer que eu mantenha?",
    },
    {
      titulo: "Cadência · pedido parado, 2º toque",
      atalho: "/loja-parado-2",
      corpo: "Vou liberar os itens se você não precisar mais — me avisa qualquer coisa.",
    },
    { titulo: "Cadência · pós-venda, 1º toque", atalho: "/loja-pos-1", corpo: "Chegou tudo certo?" },
    {
      titulo: "Cadência · pós-venda, 2º toque",
      atalho: "/loja-pos-2",
      corpo: "Se gostou, posso sugerir algo na mesma linha para a próxima.",
    },
    {
      titulo: "Cadência · recompra",
      atalho: "/loja-recompra-1",
      corpo: "Oi! Faz um tempo. Quer uma sugestão nova ou repete o que você levou da última vez?",
    },
  ],
  tiposDeCompromisso: [
    { nome: "Retirada na vinícola", categoria: "visita", duracaoMinutos: 15, local: "in_person" },
    { nome: "Degustação na loja", categoria: "visita", duracaoMinutos: 30, local: "in_person" },
    { nome: "Atendimento consultivo por vídeo", categoria: "reuniao", duracaoMinutos: 20, local: "google_meet" },
    { nome: "Entrega combinada", categoria: "outro", duracaoMinutos: 30, local: "in_person" },
  ],
  cadencias: [
    {
      nome: "Loja · pedido parado",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Aguardando pagamento" },
      passos: [
        { esperaMs: 1 * DIA, atalho: "/loja-parado-1" },
        { esperaMs: 3 * DIA, atalho: "/loja-parado-2" },
      ],
    },
    {
      nome: "Loja · depois da compra",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Pedido pago" },
      passos: [
        { esperaMs: 3 * DIA, atalho: "/loja-pos-1" },
        { esperaMs: 20 * DIA, atalho: "/loja-pos-2" },
      ],
    },
    {
      nome: "Loja · recompra",
      gatilho: { kind: "manual" },
      passos: [{ esperaMs: 0, atalho: "/loja-recompra-1" }],
    },
  ],
};
