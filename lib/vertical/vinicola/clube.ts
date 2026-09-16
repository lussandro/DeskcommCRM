/**
 * Jornada 3 — Clube de assinatura.
 *
 * Texto copiado do anexo da spec, §"Jornada 3 — Clube de assinatura". Qualquer
 * mudança de conteúdo muda o anexo PRIMEIRO; este arquivo o segue.
 *
 * ⚠️ *Plano escolhido* (`qualified`) não é enchimento: sem ela sobravam 4
 * etapas de trabalho para 5 passos e o pacote reprovaria no gate de cobertura.
 * Ela separa "já sei qual plano ele quer" de "a adesão está em curso" — e é
 * entre as duas que mora a cadência A.
 *
 * ⚠️ Retenção de assinante NÃO vira etapa: vive na tag `risco-cancelamento`
 * mais a cadência C. Etapa depois do ganho quebraria a leitura do quadro.
 */
import type { JornadaDeVinicola } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;

export const CLUBE: JornadaDeVinicola = {
  comoSeApresenta: "Vender assinaturas do clube de vinhos",
  nomeDoFunil: "Clube de assinatura",
  vocabulario: { lead: "Interessado", deal: "Assinatura", won: "Assinante ativo", lost: "Não assinou" },
  etapas: [
    { nome: "Interesse no clube", passo: "new" },
    { nome: "Explicando o clube", passo: "contacted" },
    { nome: "Escolhendo o plano", passo: "qualifying" },
    { nome: "Plano escolhido", passo: "qualified" },
    { nome: "Aguardando adesão", passo: "negotiating" },
    { nome: "Assinante ativo", passo: "won" },
    { nome: "Não assinou", passo: "lost" },
  ],
  motivosDePerda: [
    "Achou o valor alto",
    "Não quer compromisso recorrente",
    "Menor de 18 anos",
    "Não entregamos na região dele",
    "Já assina outro clube",
    "Parou de responder",
  ],
  campos: [
    {
      key: "frequencia_desejada",
      label: "Frequência desejada",
      type: "select",
      options: [
        { value: "mensal", label: "Mensal" },
        { value: "bimestral", label: "Bimestral" },
        { value: "trimestral", label: "Trimestral" },
        { value: "ainda_nao_sabe", label: "Ainda não sabe" },
      ],
    },
    {
      key: "perfil_de_vinho",
      label: "Perfil de vinho preferido",
      type: "multiselect",
      options: [
        { value: "tinto", label: "Tinto" },
        { value: "branco", label: "Branco" },
        { value: "rose", label: "Rosé" },
        { value: "espumante", label: "Espumante" },
        { value: "sem_preferencia", label: "Sem preferência" },
      ],
    },
    {
      key: "consumo_mensal",
      label: "Consumo por mês (garrafas)",
      type: "select",
      options: [
        { value: "1_a_2", label: "1 a 2" },
        { value: "3_a_5", label: "3 a 5" },
        { value: "6_a_11", label: "6 a 11" },
        { value: "12_ou_mais", label: "12 ou mais" },
      ],
    },
    { key: "cidade_uf_entrega", label: "Cidade e UF de entrega", type: "text" },
    {
      key: "ja_visitou",
      label: "Já visitou a vinícola",
      type: "select",
      options: [
        { value: "sim", label: "Sim" },
        { value: "nao", label: "Não" },
        { value: "nao_informado", label: "Não informado" },
      ],
    },
    { key: "data_de_adesao", label: "Data de adesão", type: "date" },
    {
      key: "origem_do_interesse",
      label: "Origem do interesse",
      type: "select",
      options: [
        { value: "visita", label: "Visita" },
        { value: "loja", label: "Loja" },
        { value: "instagram", label: "Instagram" },
        { value: "indicacao", label: "Indicação" },
        { value: "site", label: "Site" },
        { value: "outro", label: "Outro" },
      ],
    },
    { key: "quem_recebe", label: "Quem recebe a caixa", type: "text" },
  ],
  tags: [
    "clube",
    "assinante-ativo",
    "risco-cancelamento",
    "pausa-solicitada",
    "troca-de-plano",
    "indicou-amigo",
    "entrega-com-problema",
    "renovacao",
  ],
  respostasRapidas: [
    {
      titulo: "Explicar o clube",
      atalho: "/clube-explicar",
      corpo:
        "O clube funciona assim: {{como_funciona_o_clube}}. Você recebe {{o_que_vem_na_caixa}} a cada {{frequencia_do_clube}}.",
    },
    {
      titulo: "Planos",
      atalho: "/clube-planos",
      corpo: "Temos estes planos: {{planos_do_clube}}. Qual faz mais sentido para o seu consumo?",
    },
    {
      titulo: "Entrega",
      atalho: "/clube-entrega",
      corpo:
        "Entregamos em {{regioes_de_entrega}}, com prazo de {{prazo_de_entrega}}. {{regra_de_frete_do_clube}}.",
    },
    {
      titulo: "Cobrança",
      atalho: "/clube-cobranca",
      corpo: "A cobrança é {{forma_de_cobranca}}, sempre {{dia_da_cobranca}}. Você recebe o aviso antes.",
    },
    {
      titulo: "Adesão confirmada",
      atalho: "/clube-bem-vindo",
      corpo:
        "Bem-vindo ao clube, {{nome}}! Sua primeira caixa sai {{data_da_primeira_caixa}}. Qualquer coisa, fala comigo por aqui.",
    },
    {
      titulo: "Pausar",
      atalho: "/clube-pausar",
      corpo: "Dá para pausar, sim: {{politica_de_pausa}}. Quer que eu registre a pausa a partir de quando?",
    },
    {
      titulo: "Cancelar",
      atalho: "/clube-cancelar",
      corpo:
        "Entendo. O cancelamento funciona assim: {{politica_de_cancelamento_clube}}. Antes disso, quer tentar {{alternativa_ao_cancelamento}}?",
    },
    {
      titulo: "Trocar o plano",
      atalho: "/clube-trocar",
      corpo: "Consigo trocar seu plano. Hoje você está em {{plano_atual}} — para qual você quer ir?",
    },
    {
      titulo: "Indicação",
      atalho: "/clube-indicacao",
      corpo: "Se quiser indicar alguém, é só me passar o contato. {{beneficio_de_indicacao}}.",
    },
    {
      titulo: "Problema na entrega",
      atalho: "/clube-problema",
      corpo:
        "Poxa, desculpa. Me manda uma foto e o número do pedido que eu resolvo — {{procedimento_de_ocorrencia}}.",
    },
    {
      titulo: "Cadência · adesão, 1º toque",
      atalho: "/clube-adesao-1",
      corpo: "Ficou alguma dúvida para fechar a assinatura?",
    },
    {
      titulo: "Cadência · adesão, 2º toque",
      atalho: "/clube-adesao-2",
      corpo:
        "Se o que pesou foi a frequência, dá para começar num plano mais leve. Me diz o que funciona para você que eu ajusto.",
    },
    {
      titulo: "Cadência · adesão, encerramento",
      atalho: "/clube-adesao-3",
      corpo: "Vou parar de insistir. O convite fica de pé quando você quiser.",
    },
    {
      titulo: "Cadência · boas-vindas, 1º toque",
      atalho: "/clube-boas-vindas-1",
      corpo:
        "Bem-vindo ao clube! Já deixei seu cadastro certinho aqui. Qualquer coisa, é só falar comigo por aqui.",
    },
    {
      titulo: "Cadência · boas-vindas, 2º toque",
      atalho: "/clube-boas-vindas-2",
      corpo: "Me conta: tem algum estilo que você prefere que eu registre na sua ficha?",
    },
    {
      titulo: "Cadência · boas-vindas, 3º toque",
      atalho: "/clube-boas-vindas-3",
      corpo: "Chegou tudo certinho? O que você achou dos rótulos desta remessa?",
    },
    {
      titulo: "Cadência · retenção, 1º toque",
      atalho: "/clube-retencao-1",
      corpo: "Vi que você pensou em sair do clube. Antes disso: o que não está funcionando para você?",
    },
    {
      titulo: "Cadência · retenção, 2º toque",
      atalho: "/clube-retencao-2",
      corpo:
        "Se for a frequência ou o perfil dos vinhos, a gente ajusta. Me diz o que você prefere que eu vejo aqui.",
    },
  ],
  tiposDeCompromisso: [
    { nome: "Degustação exclusiva de assinante", categoria: "visita", duracaoMinutos: 60, local: "in_person" },
    { nome: "Encontro online de assinantes", categoria: "reuniao", duracaoMinutos: 60, local: "google_meet" },
    { nome: "Call de retenção", categoria: "call", duracaoMinutos: 15, local: "phone" },
    { nome: "Retirada do kit na vinícola", categoria: "visita", duracaoMinutos: 15, local: "in_person" },
  ],
  cadencias: [
    {
      // O gatilho é *Plano escolhido*, e não *Aguardando adesão*: ali a adesão
      // já está em curso, e insistir seria cobrar quem está pagando.
      nome: "Clube · interesse sem adesão",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Plano escolhido" },
      passos: [
        { esperaMs: 1 * DIA, atalho: "/clube-adesao-1" },
        { esperaMs: 4 * DIA, atalho: "/clube-adesao-2" },
        { esperaMs: 10 * DIA, atalho: "/clube-adesao-3" },
      ],
    },
    {
      nome: "Clube · boas-vindas do assinante",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Assinante ativo" },
      passos: [
        { esperaMs: 0, atalho: "/clube-boas-vindas-1" },
        { esperaMs: 3 * DIA, atalho: "/clube-boas-vindas-2" },
        { esperaMs: 30 * DIA, atalho: "/clube-boas-vindas-3" },
      ],
    },
    {
      nome: "Clube · retenção",
      gatilho: { kind: "manual" },
      passos: [
        { esperaMs: 0, atalho: "/clube-retencao-1" },
        { esperaMs: 3 * DIA, atalho: "/clube-retencao-2" },
      ],
    },
  ],
};
