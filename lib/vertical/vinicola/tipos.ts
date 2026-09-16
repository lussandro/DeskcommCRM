/**
 * A FORMA de uma jornada de vinícola. Só tipo — o texto mora nos quatro
 * arquivos de dados, e a fonte dele é o anexo de conteúdo da spec.
 *
 * ⚠️ `slug` de etapa NÃO é campo aqui, e a ausência é a decisão. O aplicador
 * deriva o slug por `etapasParaGravar` + `slugDeNome`, que é o que o onboarding
 * já faz (`app/actions/onboarding/montarQuadro.ts:237`). Um slug digitado seria
 * uma segunda conta, e ela divergiria da primeira no primeiro ajuste.
 *
 * ⚠️ `is_won`/`is_lost` também não são campos: derivam de `passo`, como manda o
 * CHECK `crm_stages_hint_coerente_com_won_lost`.
 */
import type { LeadStage } from "@/lib/agent-engine/agent/lead-state";
import type { CategoriaDeAgendamento, LocalDeAgendamento } from "@/lib/agenda/tipos";
import type { CustomFieldDef } from "@/lib/schemas/settings";

export interface EtapaDaJornada {
  /** O que aparece no topo da coluna. */
  nome: string;
  /** `null` = coluna que só pessoas movem. Estado válido, não pendência. */
  passo: LeadStage | null;
}

/** O que a vinícola renomeia no funil. Até 40 caracteres cada. */
export interface VocabularioDaJornada {
  lead: string;
  deal: string;
  won: string;
  lost: string;
}

export interface RespostaRapidaDaJornada {
  titulo: string;
  /** Único em TODO o pacote — `message_templates` não tem unique por shortcut. */
  atalho: string;
  corpo: string;
  /** `true` = tem lacuna dentro de mensagem automática; a vinícola revisa antes de publicar. */
  revisarAntesDePublicar?: boolean;
}

export interface TipoDeCompromissoDaJornada {
  nome: string;
  categoria: CategoriaDeAgendamento;
  duracaoMinutos: number;
  local: LocalDeAgendamento;
  /**
   * O complemento do local, quando "Presencial" sozinho mente.
   *
   * O anexo distingue **"Presencial"** (na vinícola) de **"Presencial (no
   * canal)"** — a visita do representante, que acontece no estabelecimento do
   * CLIENTE (anexo, linha 348). `LOCAIS_DE_AGENDAMENTO` não tem como separar os
   * dois: é uma lista fechada de cinco valores (`lib/agenda/tipos.ts:56-64`) e
   * `in_person` é o único presencial. Quem carrega a diferença é a coluna
   * `location_details` (`supabase/baseline.sql:15127`), que já existe e é
   * `text` livre — e é ela que a tela de Agenda mostra ao lado do local
   * (`CAMPO_EXIGIDO_PELO_LOCAL` pede "endereco" justamente para `in_person`,
   * `lib/agenda/tipos.ts:75`).
   *
   * Sem este campo, os dois tipos nasceriam indistinguíveis e quem marcasse a
   * visita do representante não saberia para onde ir.
   */
  detalhesDoLocal?: string;
  /**
   * Antecedência SUGERIDA do lembrete, em minutos (15 a 10.080 pela rota).
   * O lembrete nasce DESLIGADO — quem liga é a vinícola, na tela de Agenda.
   */
  lembreteMinutosAntes?: number;
}

/** Um passo de cadência. Sempre `template`: o corpo mora numa resposta rápida. */
export interface PassoDeCadencia {
  /** 0 = imediato. Senão, de 300.000 a 7.776.000.000 ms (`waitConfigSchema`). */
  esperaMs: number;
  /** O atalho da resposta rápida desta jornada que carrega o corpo. */
  atalho: string;
}

export type GatilhoDaCadencia =
  | { kind: "manual" }
  | { kind: "appointment_no_show" }
  /** `nomeDaEtapa` é resolvido para o id real na aplicação. */
  | { kind: "stage_change"; nomeDaEtapa: string }
  /** 5 a 10.080 minutos. Não filtra por etapa — `segments` casa TAGS. */
  | { kind: "silence"; minutos: number };

export interface CadenciaDaJornada {
  nome: string;
  gatilho: GatilhoDaCadencia;
  /**
   * Quando presente, um nó `condition` entra entre o gatilho e o primeiro
   * passo: `lead_stage` `eq` o **id** desta etapa. Nome ou slug cairia sempre
   * no ramo "não", em silêncio (`lib/followup/node-handlers.ts:294`).
   */
  somenteNaEtapa?: string;
  passos: PassoDeCadencia[];
}

export interface JornadaDeVinicola {
  /** Como a vinícola se reconhece na lista do onboarding. */
  comoSeApresenta: string;
  /** O nome do funil. */
  nomeDoFunil: string;
  vocabulario: VocabularioDaJornada;
  etapas: EtapaDaJornada[];
  motivosDePerda: string[];
  campos: CustomFieldDef[];
  /** Tags canônicas do funil e da conversa. Minúsculas, até 40. */
  tags: string[];
  respostasRapidas: RespostaRapidaDaJornada[];
  tiposDeCompromisso: TipoDeCompromissoDaJornada[];
  cadencias: CadenciaDaJornada[];
}
