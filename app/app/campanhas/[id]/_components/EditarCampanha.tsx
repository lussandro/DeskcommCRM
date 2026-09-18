"use client";

/**
 * Editar a campanha em rascunho: mensagem, ritmo, horário e teto.
 *
 * O ritmo mora AQUI, e não só na tela do número, porque quem monta uma
 * prospecção fria decide coisa diferente de quem cuida do atendimento: o
 * atendimento responde quem escreveu (1,2 s entre mensagens é seguro), a
 * prospecção fala com quem não pediu (1,2 s é o padrão que derruba número).
 *
 * Vazio = herda o do número. A tela diz isso em vez de mostrar o valor herdado
 * preenchido: campo preenchido com valor de outro lugar faz o operador achar
 * que configurou o que não configurou.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { saudacaoDaHora } from "@/lib/campanha/decisao";

interface Props {
  campanhaId: string;
  editavel: boolean;
  fuso: string;
  inicial: {
    template_body: string;
    intervalo_segundos: number | null;
    janela_inicio_hora: number | null;
    janela_fim_hora: number | null;
    teto_diario: number | null;
  };
  /** O que o NÚMERO impõe hoje — o piso que a campanha não afrouxa. */
  doCanal: { janela: string; tetoDiario: number | null };
}

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function EditarCampanha({ campanhaId, editavel, fuso, inicial, doCanal }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const [texto, setTexto] = useState(inicial.template_body);
  const [intervalo, setIntervalo] = useState(inicial.intervalo_segundos?.toString() ?? "");
  const [inicio, setInicio] = useState(inicial.janela_inicio_hora?.toString() ?? "");
  const [fim, setFim] = useState(inicial.janela_fim_hora?.toString() ?? "");
  const [teto, setTeto] = useState(inicial.teto_diario?.toString() ?? "");

  const previa = texto.replace(/\{\{\s*saudacao\s*\}\}/g, saudacaoDaHora(new Date(), fuso));

  function salvar() {
    startTransition(async () => {
      const r = await fetch(`/api/v1/campaigns/${campanhaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template_body: texto,
          intervalo_segundos: num(intervalo),
          janela_inicio_hora: num(inicio),
          janela_fim_hora: num(fim),
          teto_diario: num(teto),
        }),
      });
      const b = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(b?.error?.message ?? t("Não foi possível salvar."));
        return;
      }
      toast.success(t("Campanha salva."));
      setAberto(false);
      router.refresh();
    });
  }

  const resumoDoRitmo = [
    intervalo ? `${t("1 mensagem a cada")} ${intervalo}s` : t("no ritmo do número"),
    inicio && fim ? `${inicio}h–${fim}h` : `${t("horário do número")} (${doCanal.janela})`,
    teto ? `${t("até")} ${teto}/${t("dia")}` : `${t("teto do número")}${doCanal.tetoDiario ? ` (${doCanal.tetoDiario}/dia)` : ""}`,
  ].join(" · ");

  if (!aberto) {
    return (
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t("Como chega agora:")}</p>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-sm">{previa}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>{t("Ritmo:")}</strong> {resumoDoRitmo}
        </p>
        {editavel ? (
          <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>
            {t("Editar campanha")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("A campanha já começou — mensagem e ritmo viram histórico e não mudam mais.")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="edit-texto">{t("A mensagem")}</Label>
        <Textarea id="edit-texto" rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          {t("Use {{saudacao}} para bom dia/boa tarde/boa noite conforme a hora do envio.")}
        </p>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("Ritmo desta campanha")}</legend>
        <p className="text-xs text-muted-foreground">
          {t("Deixe vazio para seguir o número. Preencher só aperta: a campanha nunca fica mais rápida que o número permite.")}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="edit-intervalo">{t("Intervalo entre mensagens (segundos)")}</Label>
          <Input
            id="edit-intervalo"
            type="number"
            min={30}
            max={86400}
            value={intervalo}
            onChange={(e) => setIntervalo(e.target.value)}
            placeholder={t("vazio = ritmo do número")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Lista fria pede intervalo largo: 300s (5 min) espalha 30 mensagens por 2h30 em vez de 30 minutos.")}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-inicio">{t("Começa às")}</Label>
            <Input id="edit-inicio" type="number" min={0} max={23} value={inicio} onChange={(e) => setInicio(e.target.value)} placeholder="9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-fim">{t("Para às")}</Label>
            <Input id="edit-fim" type="number" min={1} max={24} value={fim} onChange={(e) => setFim(e.target.value)} placeholder="18" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-teto">{t("Máximo por dia")}</Label>
            <Input id="edit-teto" type="number" min={1} max={1000} value={teto} onChange={(e) => setTeto(e.target.value)} placeholder="20" />
          </div>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button size="sm" onClick={salvar} disabled={pending || !texto.trim()}>
          {t("Salvar campanha")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setTexto(inicial.template_body);
            setIntervalo(inicial.intervalo_segundos?.toString() ?? "");
            setInicio(inicial.janela_inicio_hora?.toString() ?? "");
            setFim(inicial.janela_fim_hora?.toString() ?? "");
            setTeto(inicial.teto_diario?.toString() ?? "");
            setAberto(false);
          }}
        >
          {t("Cancelar")}
        </Button>
      </div>
    </div>
  );
}
