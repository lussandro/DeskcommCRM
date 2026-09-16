"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { aplicarJornadaDeVinicola } from "@/app/actions/settings/aplicarJornadaDeVinicola";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { CHAVES_DE_JORNADA, JORNADAS, type ChaveDeJornada } from "@/lib/vertical/vinicola";
import type { EstadoDaPeca, RelatorioDaJornada } from "@/lib/vertical/vinicola/aplicar";

export interface EstadoNaTela {
  estado: "nao_aplicada" | "aplicada" | "parcial";
  /** Já formatado no servidor, no idioma de quem lê. `null` = nunca aplicada. */
  aplicadaEm: string | null;
}

/**
 * O que cada desfecho de peça significa para quem está lendo a tela.
 *
 * ⚠️ `nao_verificada` NÃO É FALHA E NÃO É SUCESSO, e é o rótulo mais difícil
 * dos cinco: a linha existe, com o nome que a jornada usaria, e o pacote não
 * encostou nela (a regra 9 do aplicador proíbe sobrescrever linha existente).
 * Chamá-la de "já existia" repetiria a mentira que a Task 2 consertou; chamá-la
 * de erro assustaria quem não tem erro nenhum.
 *
 * Tabela de módulo, e não `t()` montado na hora: é a forma que a cerca de i18n
 * sabe resolver, então cada um destes rótulos entra na conta de cobertura.
 */
const ROTULO_DO_DESFECHO: Record<EstadoDaPeca, string> = {
  criada: "criada agora",
  ja_existia: "já existia, igual à da jornada",
  nao_verificada: "já estava lá com esse nome — o pacote não mexeu nela",
  no_ledger_e_apagada: "foi criada antes e depois apagada",
  falhou: "não deu para criar",
};

/** Desfecho que a pessoa PRECISA ler. `criada` e `ja_existia` são o esperado. */
function mereceRelato(estado: EstadoDaPeca): boolean {
  return estado !== "criada" && estado !== "ja_existia";
}

export function JornadasClient({
  estados,
  podeAplicar,
}: {
  estados: Record<ChaveDeJornada, EstadoNaTela>;
  podeAplicar: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  /**
   * Qual jornada está sendo aplicada AGORA.
   *
   * Não é enfeite de carregamento: é a trava. `pending` sozinho não diz qual
   * botão foi clicado, e sem isso os quatro continuariam clicáveis durante a
   * aplicação — o clique duplo é a corrida que acontece de verdade, e é a única
   * que dá para fechar sem trava no banco (Task 2, regra 12).
   */
  const [correndo, setCorrendo] = useState<ChaveDeJornada | null>(null);
  /** O relatório da última aplicação, por jornada — o que o toast não cabe dizer. */
  const [relatorios, setRelatorios] = useState<Partial<Record<ChaveDeJornada, RelatorioDaJornada>>>(
    {},
  );

  function ativar(chave: ChaveDeJornada) {
    setCorrendo(chave);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("jornada", chave);
      const r = await aplicarJornadaDeVinicola(fd);
      setCorrendo(null);
      if (!r.ok) {
        // O texto real do erro, sem máscara — quem lê precisa saber o que falhou.
        toast.error(r.erro);
        return;
      }
      setRelatorios((atuais) => ({ ...atuais, [chave]: r.relatorio }));
      const falhas = r.relatorio.pecas.filter((p) => p.estado === "falhou");
      if (falhas.length > 0) {
        toast.warning(`${t("Não consegui ativar tudo")}: ${falhas.map((f) => f.erro).join(" · ")}`);
        return;
      }
      toast.success(t("Jornada ativada"));
    });
  }

  return (
    <div className="space-y-4">
      {/* O aviso que a §4.4 da spec obriga, sempre visível — não é rodapé. */}
      <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        {t(
          "As cadências entram como rascunho. Para elas começarem a mandar mensagem, é preciso um agente de IA publicado, com follow-up ligado, e o WhatsApp conectado.",
        )}
      </p>

      {CHAVES_DE_JORNADA.map((chave) => {
        const j = JORNADAS[chave];
        const { estado, aplicadaEm } = estados[chave];
        const relatorio = relatorios[chave];
        const aRelatar = relatorio?.pecas.filter((p) => mereceRelato(p.estado)) ?? [];
        return (
          <section key={chave} className="rounded-lg border p-4">
            {/*
              Conteúdo do pacote: SEM `t()`, como no passo do onboarding. A mesma
              string vira nome de coisa no banco logo adiante, e `t()` sobre
              acesso dinâmico daria só a aparência de tradução.
            */}
            <h2 className="font-medium">{j.nomeDoFunil}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{j.comoSeApresenta}</p>

            <p className="mt-3 text-sm">
              {/*
                ⚠️ "Esta jornada …" e não "Ativada" seco: `Ativada` JÁ É CHAVE
                do dicionário, de outra tela, traduzida no feminino
                (`Activada`). Reusá-la aqui daria colisão de chave no arquivo e,
                pior, uma frase que discorda do gênero de `Recorrido` em
                espanhol. Chave própria, frase inteira, nenhum dos dois.
              */}
              {estado === "nao_aplicada" ? t("Esta jornada não está ativada") : null}
              {estado === "aplicada" ? t("Esta jornada está ativada") : null}
              {estado === "parcial" ? t("Ativada, com peças removidas") : null}
              {estado !== "nao_aplicada" && aplicadaEm ? (
                <span className="text-muted-foreground"> · {aplicadaEm}</span>
              ) : null}
            </p>

            {estado === "parcial" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Ativar de novo não recria o que você apagou — só cria o que nunca existiu.")}
              </p>
            ) : null}

            {/* O que ela cria, em números, para a decisão não ser às cegas. */}
            <p className="mt-2 text-xs text-muted-foreground">
              {j.etapas.length} {t("colunas")} · {j.campos.length} {t("campos")} ·{" "}
              {j.respostasRapidas.length} {t("respostas rápidas")} ·{" "}
              {j.tiposDeCompromisso.length} {t("tipos de compromisso")} ·{" "}
              {j.cadencias.length} {t("cadências em rascunho")}
            </p>

            {/*
              O relatório da aplicação que acabou de correr. Só o que foge do
              esperado entra: peça criada e peça idêntica à da jornada não têm o
              que contar, e listá-las esconderia as três que têm.

              O `erro` da peça já é uma frase pronta — inclusive para
              `nao_verificada`, onde ele explica o que estava lá. Mostrar o texto
              real é a regra; resumir seria inventar.
            */}
            {relatorio && aRelatar.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
                {aRelatar.map((p) => (
                  <li key={`${p.tipo}:${p.chave}`}>
                    <span className="font-medium">{p.chave}</span>
                    {/*
                      Só `falhou` ganha destaque. `nao_verificada` fica NEUTRA
                      de propósito: ela não é erro — é linha que já estava lá e
                      que o pacote não mexeu —, e pintá-la de vermelho
                      assustaria quem não tem defeito nenhum. Sem isto os cinco
                      desfechos eram tipograficamente idênticos, e quem batia o
                      olho numa lista de seis peças não distinguia aviso de erro.
                    */}
                    <span
                      className={p.estado === "falhou" ? "text-destructive" : "text-muted-foreground"}
                    >
                      {" "}
                      — {t(ROTULO_DO_DESFECHO[p.estado])}
                      {p.erro ? `: ${p.erro}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {podeAplicar ? (
              <Button
                type="button"
                className="mt-3"
                // ⚠️ DESABILITADO ENQUANTO QUALQUER APLICAÇÃO CORRE. Não só a
                // desta jornada: o aplicador escreve no MESMO
                // `organizations.settings`, e duas aplicações concorrentes
                // perdem uma das gravações do ledger (ler-modificar-gravar).
                disabled={pending}
                onClick={() => ativar(chave)}
              >
                {correndo === chave ? t("Ativando…") : t("Ativar jornada")}
              </Button>
            ) : (
              // Honestidade, não permissão nova: quem é gerente vê o estado e
              // sabe por que não pode agir.
              <p className="mt-3 text-xs text-muted-foreground">
                {t("Só quem administra a empresa pode ativar uma jornada.")}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
