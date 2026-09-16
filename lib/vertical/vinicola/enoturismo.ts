/**
 * Jornada 2 — Enoturismo (visitas e degustações na vinícola).
 *
 * Texto copiado do anexo da spec, §"Jornada 2 — Enoturismo". Qualquer mudança
 * de conteúdo muda o anexo PRIMEIRO; este arquivo o segue.
 *
 * ⚠️ A véspera da visita NÃO é passo de cadência: o motor não sabe esperar até
 * uma data (`waitConfigSchema` só tem `fixed` e `smart`), e quem confirma com
 * dois meses de antecedência receberia o "é amanhã!" dois meses antes. Quem
 * cobre a véspera é o lembrete do tipo de compromisso — daí o
 * `lembreteMinutosAntes: 1440` nos três tipos presenciais. O lembrete nasce
 * DESLIGADO: ligá-lo é da vinícola, na tela de Agenda.
 */
import type { JornadaDeVinicola } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;

export const ENOTURISMO: JornadaDeVinicola = {
  comoSeApresenta: "Receber visitantes para visitas e degustações na vinícola",
  nomeDoFunil: "Visitas e degustações",
  vocabulario: { lead: "Interessado", deal: "Visita", won: "Visita realizada", lost: "Não veio" },
  etapas: [
    { nome: "Novo interessado", passo: "new" },
    { nome: "Tirando dúvidas", passo: "contacted" },
    { nome: "Escolhendo data", passo: "qualifying" },
    { nome: "Aguardando confirmação", passo: "qualified" },
    { nome: "Reserva confirmada", passo: "negotiating" },
    { nome: "Visita realizada", passo: "won" },
    { nome: "Não veio", passo: "lost" },
  ],
  motivosDePerda: [
    "Menor de 18 anos",
    "Sem data disponível no período que ele queria",
    "Grupo não confirmou",
    "Desistiu — escolheu outro passeio",
    "Não compareceu",
    "Só queria informação",
  ],
  campos: [
    { key: "numero_de_pessoas", label: "Número de pessoas", type: "number" },
    { key: "data_pretendida", label: "Data pretendida", type: "date" },
    {
      key: "tipo_de_grupo",
      label: "Tipo de grupo",
      type: "select",
      options: [
        { value: "casal", label: "Casal" },
        { value: "familia", label: "Família" },
        { value: "amigos", label: "Amigos" },
        { value: "sozinho", label: "Sozinho" },
        { value: "corporativo", label: "Corporativo" },
        { value: "agencia_ou_operadora", label: "Agência ou operadora" },
      ],
    },
    {
      key: "tem_criancas",
      label: "Tem crianças no grupo",
      type: "select",
      options: [
        { value: "sim", label: "Sim" },
        { value: "nao", label: "Não" },
        { value: "nao_informado", label: "Não informado" },
      ],
    },
    { key: "cidade_de_origem", label: "Cidade de origem", type: "text" },
    {
      key: "interesse_na_visita",
      label: "Interesse",
      type: "multiselect",
      options: [
        { value: "degustacao", label: "Degustação" },
        { value: "tour_no_vinhedo", label: "Tour no vinhedo" },
        { value: "tour_na_cantina", label: "Tour na cantina" },
        { value: "refeicao", label: "Refeição" },
        { value: "compra_na_loja", label: "Compra na loja" },
        { value: "evento_privado", label: "Evento privado" },
      ],
    },
    {
      key: "idioma_de_preferencia",
      label: "Idioma de preferência",
      type: "select",
      options: [
        { value: "portugues", label: "Português" },
        { value: "espanhol", label: "Espanhol" },
        { value: "ingles", label: "Inglês" },
      ],
    },
    {
      key: "origem_do_contato",
      label: "Como chegou até nós",
      type: "select",
      options: [
        { value: "instagram", label: "Instagram" },
        { value: "google", label: "Google" },
        { value: "indicacao", label: "Indicação" },
        { value: "agencia", label: "Agência" },
        { value: "ja_visitou_antes", label: "Já visitou antes" },
        { value: "outro", label: "Outro" },
      ],
    },
  ],
  tags: [
    "enoturismo",
    "grupo-grande",
    "agencia-de-turismo",
    "com-criancas",
    "feriado",
    "visita-remarcada",
    "visitante-estrangeiro",
    "nao-compareceu",
  ],
  respostasRapidas: [
    {
      titulo: "Boas-vindas da visita",
      atalho: "/eno-ola",
      corpo:
        "Olá, {{nome}}! Que bom que você quer conhecer a {{nome_da_vinicola}}. Me conta: para quantas pessoas e que dia você pensou?",
    },
    {
      titulo: "Horários e roteiros",
      atalho: "/eno-horarios",
      corpo:
        "Recebemos visitas {{horario_visitas}}. O roteiro é {{roteiro_da_visita}} e leva cerca de {{duracao_da_visita}}.",
    },
    {
      titulo: "Valores",
      atalho: "/eno-valores",
      corpo: "A visita com degustação fica em {{valor_da_visita}} por pessoa. {{o_que_inclui}}.",
    },
    {
      titulo: "Como chegar",
      atalho: "/eno-como-chegar",
      corpo:
        "Estamos em {{endereco_da_vinicola}}. {{orientacao_de_acesso}}. Qualquer coisa me chama no dia.",
    },
    {
      titulo: "Confirmação da reserva",
      atalho: "/eno-confirmada",
      corpo:
        "Reserva confirmada: {{data_e_hora}}, para {{numero_de_pessoas}} pessoas. Chegue uns minutos antes para começarmos no horário.",
    },
    {
      titulo: "Grupos",
      atalho: "/eno-grupo",
      corpo:
        "Para grupos a partir de {{tamanho_de_grupo}} pessoas temos condições e horários próprios: {{condicoes_de_grupo}}. Quantas pessoas seriam?",
    },
    {
      titulo: "Crianças e pets",
      atalho: "/eno-criancas-pets",
      corpo:
        "Crianças podem vir, com a degustação só para maiores de 18. {{politica_de_criancas_e_pets}}.",
    },
    {
      titulo: "Idade mínima",
      atalho: "/eno-idade",
      corpo:
        "A degustação é só para maiores de 18 anos — é lei. Todo mundo do grupo é maior de idade?",
    },
    {
      titulo: "Remarcar",
      atalho: "/eno-remarcar",
      corpo:
        "Sem problema, a gente remarca. Temos {{disponibilidade_proxima}}. Qual fica melhor para você?",
    },
    {
      titulo: "Pós-visita",
      atalho: "/eno-obrigado",
      corpo:
        "Foi ótimo receber vocês! Se quiser levar algo que provou aqui, é só me dizer — {{canal_de_venda_ao_consumidor}}.",
    },
    {
      titulo: "Cadência · reserva confirmada",
      atalho: "/eno-reserva-1",
      corpo:
        "Sua reserva está confirmada. Anotei aqui o dia, o horário e o número de pessoas — qualquer mudança, é só me avisar por aqui.",
    },
    {
      titulo: "Cadência · escolhendo data, 1º toque",
      atalho: "/eno-data-1",
      corpo: "Ainda quer marcar? Me diz um dia que funcione para você que eu vejo o que tenho aberto.",
    },
    {
      titulo: "Cadência · escolhendo data, encerramento",
      atalho: "/eno-data-2",
      corpo: "Deixo o convite aberto. Quando quiser vir, me chama que eu encaixo.",
    },
    {
      titulo: "Cadência · faltou, 1º toque",
      atalho: "/eno-faltou-1",
      corpo: "Sentimos sua falta hoje. Aconteceu alguma coisa? Se quiser, eu remarco.",
    },
    {
      titulo: "Cadência · faltou, 2º toque",
      atalho: "/eno-faltou-2",
      corpo: "Quando der, me avisa que eu vejo uma data nova para vocês.",
    },
    {
      titulo: "Cadência · pós-visita, 1º toque",
      atalho: "/eno-pos-1",
      corpo: "Obrigado pela visita! O que vocês mais gostaram de provar?",
    },
    {
      titulo: "Cadência · pós-visita, 2º toque",
      atalho: "/eno-pos-2",
      corpo: "Se quiser repetir em casa, dá para comprar por aqui: {{canal_de_venda_ao_consumidor}}.",
      revisarAntesDePublicar: true,
    },
  ],
  tiposDeCompromisso: [
    {
      nome: "Visita guiada",
      categoria: "visita",
      duracaoMinutos: 60,
      local: "in_person",
      lembreteMinutosAntes: 1440,
    },
    {
      nome: "Degustação",
      categoria: "visita",
      duracaoMinutos: 45,
      local: "in_person",
      lembreteMinutosAntes: 1440,
    },
    {
      nome: "Visita + refeição",
      categoria: "visita",
      duracaoMinutos: 180,
      local: "in_person",
      lembreteMinutosAntes: 1440,
    },
    { nome: "Atendimento a agência ou grupo", categoria: "reuniao", duracaoMinutos: 30, local: "google_meet" },
  ],
  cadencias: [
    {
      nome: "Enoturismo · antes da visita",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Reserva confirmada" },
      passos: [{ esperaMs: 0, atalho: "/eno-reserva-1" }],
    },
    {
      // O silêncio não filtra por etapa (`segments` casa TAGS), então quem
      // segura a cadência em "Escolhendo data" é o nó de condição do grafo.
      nome: "Enoturismo · silêncio antes de marcar a data",
      gatilho: { kind: "silence", minutos: 3 * 24 * 60 },
      somenteNaEtapa: "Escolhendo data",
      passos: [
        { esperaMs: 0, atalho: "/eno-data-1" },
        { esperaMs: 4 * DIA, atalho: "/eno-data-2" },
      ],
    },
    {
      nome: "Enoturismo · não compareceu",
      gatilho: { kind: "appointment_no_show" },
      passos: [
        { esperaMs: 0, atalho: "/eno-faltou-1" },
        { esperaMs: 3 * DIA, atalho: "/eno-faltou-2" },
      ],
    },
    {
      nome: "Enoturismo · depois da visita",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Visita realizada" },
      passos: [
        { esperaMs: 1 * DIA, atalho: "/eno-pos-1" },
        { esperaMs: 5 * DIA, atalho: "/eno-pos-2" },
      ],
    },
  ],
};
