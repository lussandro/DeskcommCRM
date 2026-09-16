/**
 * Jornada 1 — Canal e revenda (B2B).
 *
 * Texto copiado do anexo da spec, §"Jornada 1 — Canal e revenda". Qualquer
 * mudança de conteúdo muda o anexo PRIMEIRO; este arquivo o segue.
 *
 * ⚠️ É a única jornada com 6 etapas de trabalho, logo a única com etapa sem
 * dica: `Amostra ou degustação`. Estado válido (`EtapaProposta.passo` é
 * `LeadStage | null`) e que não tira a cobertura de 5/5 — `coberturaDoFunil` só
 * conta as dicas presentes (`lib/leads/agent-mapping.ts:295-301`).
 */
import type { JornadaDeVinicola } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;

export const CANAL: JornadaDeVinicola = {
  comoSeApresenta: "Vender para restaurantes, empórios e distribuidores",
  nomeDoFunil: "Canal e revenda",
  vocabulario: { lead: "Contato comercial", deal: "Proposta", won: "Pedido fechado", lost: "Não fechou" },
  etapas: [
    { nome: "Novo contato", passo: "new" },
    { nome: "Entendendo o canal", passo: "contacted" },
    { nome: "Cadastro conferido", passo: "qualifying" },
    { nome: "Tabela enviada", passo: "qualified" },
    { nome: "Amostra ou degustação", passo: null },
    { nome: "Negociando pedido", passo: "negotiating" },
    { nome: "Pedido fechado", passo: "won" },
    { nome: "Não fechou", passo: "lost" },
  ],
  motivosDePerda: [
    "Preço acima do que o canal trabalha",
    "Não é revenda — sem cadastro de pessoa jurídica",
    "Volume mínimo não atendido",
    "Já trabalha com outra vinícola",
    "Fora da região que atendemos",
    "Parou de responder",
  ],
  campos: [
    {
      key: "tipo_de_canal",
      label: "Tipo de canal",
      type: "select",
      options: [
        { value: "distribuidor", label: "Distribuidor" },
        { value: "importador", label: "Importador" },
        { value: "restaurante", label: "Restaurante" },
        { value: "bar_wine_bar", label: "Bar/wine bar" },
        { value: "hotel_ou_pousada", label: "Hotel ou pousada" },
        { value: "emporio_ou_loja", label: "Empório ou loja" },
        { value: "supermercado", label: "Supermercado" },
        { value: "outro", label: "Outro" },
      ],
    },
    {
      key: "regiao_de_atuacao",
      label: "Região de atuação",
      type: "select",
      options: [
        { value: "norte", label: "Norte" },
        { value: "nordeste", label: "Nordeste" },
        { value: "centro_oeste", label: "Centro-Oeste" },
        { value: "sudeste", label: "Sudeste" },
        { value: "sul", label: "Sul" },
      ],
    },
    { key: "estado_uf", label: "Estado (UF)", type: "text" },
    { key: "volume_mensal_garrafas", label: "Volume estimado por mês (garrafas)", type: "number" },
    {
      key: "rotulos_de_interesse",
      label: "Rótulos de interesse",
      type: "multiselect",
      options: [
        { value: "tinto", label: "Tinto" },
        { value: "branco", label: "Branco" },
        { value: "rose", label: "Rosé" },
        { value: "espumante", label: "Espumante" },
        { value: "frisante", label: "Frisante" },
        { value: "licoroso", label: "Licoroso" },
        { value: "suco_de_uva", label: "Suco de uva" },
        { value: "sem_alcool", label: "Sem álcool" },
      ],
    },
    {
      key: "revende_vinho_nacional",
      label: "Já revende vinho nacional",
      type: "select",
      options: [
        { value: "sim", label: "Sim" },
        { value: "nao", label: "Não" },
        { value: "nao_informado", label: "Não informado" },
      ],
    },
    {
      key: "forma_de_recebimento",
      label: "Forma de recebimento",
      type: "select",
      options: [
        { value: "entrega_no_estabelecimento", label: "Entrega no estabelecimento" },
        { value: "retirada_na_vinicola", label: "Retirada na vinícola" },
        { value: "transportadora_do_canal", label: "Transportadora do canal" },
      ],
    },
    { key: "data_ultimo_pedido", label: "Data do último pedido", type: "date" },
  ],
  tags: [
    "canal-b2b",
    "distribuidor",
    "restaurante",
    "hotel",
    "emporio",
    "aguarda-amostra",
    "pedido-recorrente",
    "sem-cadastro-pj",
  ],
  respostasRapidas: [
    {
      titulo: "Boas-vindas do canal",
      atalho: "/canal-ola",
      corpo:
        "Olá, {{nome}}! Aqui é a {{nome_da_vinicola}}. Que bom ter você por aqui. Me conta rapidinho: é restaurante, loja, distribuidora? E em que cidade vocês atuam?",
    },
    {
      titulo: "Pedir dados de cadastro",
      atalho: "/canal-cadastro",
      corpo:
        "Para abrir o cadastro de revenda eu preciso de: {{exigencias_de_cadastro}}. Pode mandar por aqui mesmo que eu encaminho.",
    },
    {
      titulo: "Enviar tabela",
      atalho: "/canal-tabela",
      corpo:
        "Segue nossa tabela para revenda. As condições de pedido são {{condicoes_comerciais}}. Qualquer dúvida sobre rótulo ou mix, me chama.",
    },
    {
      titulo: "Pedido mínimo",
      atalho: "/canal-minimo",
      corpo:
        "Nosso pedido mínimo para revenda é {{pedido_minimo}}. Dá para montar mix entre os rótulos, não precisa fechar caixa de um só.",
    },
    {
      titulo: "Amostra",
      atalho: "/canal-amostra",
      corpo:
        "Consigo providenciar amostra dentro da nossa política: {{politica_de_amostra}}. Me confirma o endereço de entrega e a quem devo endereçar?",
    },
    {
      titulo: "Visita do representante",
      atalho: "/canal-visita",
      corpo:
        "Posso pedir para o nosso representante passar aí. A região é atendida {{agenda_do_representante}}. Que dia da semana funciona melhor para vocês?",
    },
    {
      titulo: "Retomar proposta",
      atalho: "/canal-retomada",
      corpo:
        "{{nome}}, tudo certo por aí? Fico à disposição para ajustar o mix da proposta se ficou algo fora do que vocês vendem.",
    },
    {
      titulo: "Prazo e entrega",
      atalho: "/canal-entrega",
      corpo:
        "O prazo de separação é {{prazo_de_expedicao}} e a entrega sai {{modalidade_de_entrega}}. Assim que o pedido entra eu te confirmo a data.",
    },
    {
      titulo: "Não é revenda",
      atalho: "/canal-sem-pj",
      corpo:
        "Nossa tabela de revenda é só para pessoa jurídica. Mas dá para comprar como consumidor: {{canal_de_venda_ao_consumidor}}. Quer que eu te ajude por lá?",
    },
    {
      titulo: "Fechamento do pedido",
      atalho: "/canal-fechamento",
      corpo:
        "Fechado assim: {{resumo_do_pedido}}. Pagamento em {{condicoes_de_pagamento}}. Confirma que eu já coloco na expedição.",
    },
    {
      titulo: "Cadência · tabela, 1º toque",
      atalho: "/canal-tabela-1",
      corpo:
        "Conseguiu dar uma olhada na tabela? Se quiser, eu monto uma sugestão de mix para o perfil da casa de vocês.",
    },
    {
      titulo: "Cadência · tabela, 2º toque",
      atalho: "/canal-tabela-2",
      corpo:
        "Passando para deixar registrado: a proposta segue de pé. Se o que travou foi volume ou prazo, me fala que eu vejo o que dá.",
    },
    {
      titulo: "Cadência · tabela, encerramento",
      atalho: "/canal-tabela-3",
      corpo: "Vou deixar você em paz por enquanto. Quando quiser retomar, é só responder aqui.",
    },
    {
      titulo: "Cadência · silêncio, 1º toque",
      atalho: "/canal-silencio-1",
      corpo: "Ficou faltando algo da minha parte para fechar?",
    },
    {
      titulo: "Cadência · silêncio, 2º toque",
      atalho: "/canal-silencio-2",
      corpo:
        "Se o momento não for agora, sem problema — me diz só quando você prefere que eu volte a falar.",
    },
    {
      titulo: "Cadência · recompra, 1º toque",
      atalho: "/canal-recompra-1",
      corpo: "Tudo bem por aí? Já está na hora de repor? Posso repetir o último pedido ou ajustar o mix.",
    },
    {
      titulo: "Cadência · recompra, 2º toque",
      atalho: "/canal-recompra-2",
      corpo: "Se preferir, eu deixo separado e você me confirma a data de entrega.",
    },
  ],
  tiposDeCompromisso: [
    { nome: "Reunião comercial", categoria: "reuniao", duracaoMinutos: 45, local: "google_meet" },
    {
      nome: "Visita do representante",
      categoria: "visita",
      duracaoMinutos: 60,
      local: "in_person",
      detalhesDoLocal: "No estabelecimento do cliente",
    },
    { nome: "Degustação para a equipe do canal", categoria: "visita", duracaoMinutos: 90, local: "in_person" },
    { nome: "Call de retomada", categoria: "call", duracaoMinutos: 20, local: "phone" },
  ],
  cadencias: [
    {
      nome: "Canal · tabela enviada sem retorno",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Tabela enviada" },
      passos: [
        { esperaMs: 2 * DIA, atalho: "/canal-tabela-1" },
        { esperaMs: 5 * DIA, atalho: "/canal-tabela-2" },
        { esperaMs: 10 * DIA, atalho: "/canal-tabela-3" },
      ],
    },
    {
      nome: "Canal · silêncio na negociação",
      gatilho: { kind: "silence", minutos: 7 * 24 * 60 },
      passos: [
        { esperaMs: 0, atalho: "/canal-silencio-1" },
        { esperaMs: 7 * DIA, atalho: "/canal-silencio-2" },
      ],
    },
    {
      nome: "Canal · recompra",
      gatilho: { kind: "manual" },
      passos: [
        { esperaMs: 0, atalho: "/canal-recompra-1" },
        { esperaMs: 7 * DIA, atalho: "/canal-recompra-2" },
      ],
    },
  ],
};
