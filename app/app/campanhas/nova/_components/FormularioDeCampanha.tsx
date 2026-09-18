"use client";

/**
 * Criar campanha — número, mensagem, base legal e AUDIÊNCIA POR FILTRO.
 *
 * A audiência é filtro sobre os contatos que a organização já tem, com prévia
 * antes de gravar. A primeira versão desta tela pedia os telefones colados num
 * campo de texto — e isso é lista colada com CRM em volta: o operador não
 * confere o recorte, não repete amanhã, e a decisão de quem recebe acaba
 * morando numa planilha ou num script que ninguém mais roda.
 *
 * A prévia diz DUAS coisas de propósito: quantos o filtro alcança e quantos
 * entram neste lote. Só o segundo número esconderia que o recorte pega 300
 * pessoas e você está mandando para 30 — e a diferença é a decisão.
 *
 * A base legal é campo de primeira classe, não letra miúda: é ela que separa
 * prospecção de spam.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { saudacaoDaHora } from "@/lib/campanha/decisao";

interface Props {
  canais: Array<{ id: string; rotulo: string }>;
  /** Etiquetas que existem nos contatos desta organização, mais usadas primeiro. */
  tags: string[];
  fuso: string;
}

function listaDeTexto(v: string): string[] {
  return v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function FormularioDeCampanha({ canais, tags, fuso }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [nome, setNome] = useState("");
  const [canal, setCanal] = useState(canais[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [baseLegal, setBaseLegal] = useState<"consent" | "legitimate_interest">("legitimate_interest");
  const [liaRef, setLiaRef] = useState("");

  const [intervalo, setIntervalo] = useState("300");
  const [janelaInicio, setJanelaInicio] = useState("9");
  const [janelaFim, setJanelaFim] = useState("18");
  const [teto, setTeto] = useState("20");

  const [comTags, setComTags] = useState<string[]>([]);
  const [semTags, setSemTags] = useState<string[]>([]);
  const [ddds, setDdds] = useState("");
  const [limite, setLimite] = useState("30");

  const [previa, setPrevia] = useState<{ alcancados: number; neste_lote: number; amostra: string[] } | null>(null);

  const filtro = {
    com_tags: comTags.length > 0 ? comTags : undefined,
    sem_tags: semTags.length > 0 ? semTags : undefined,
    ddds: listaDeTexto(ddds).length > 0 ? listaDeTexto(ddds) : undefined,
    limite: Number(limite) || 30,
  };
  const temCriterio = !!(filtro.com_tags || filtro.sem_tags || filtro.ddds);

  function alternar(lista: string[], set: (v: string[]) => void, tag: string) {
    set(lista.includes(tag) ? lista.filter((x) => x !== tag) : [...lista, tag]);
    setPrevia(null);
  }

  /** Cria o rascunho e devolve o id — a prévia precisa de uma campanha para pendurar o filtro. */
  async function garantirRascunho(): Promise<string | null> {
    const r = await fetch("/api/v1/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: nome,
        channel_session_id: canal,
        template_body: texto,
        base_legal: baseLegal,
        lia_ref: baseLegal === "legitimate_interest" ? liaRef : null,
        intervalo_segundos: intervalo.trim() ? Number(intervalo) : null,
        janela_inicio_hora: janelaInicio.trim() ? Number(janelaInicio) : null,
        janela_fim_hora: janelaFim.trim() ? Number(janelaFim) : null,
        teto_diario: teto.trim() ? Number(teto) : null,
      }),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      toast.error(corpo?.error?.message ?? t("Não foi possível criar a campanha."));
      return null;
    }
    return corpo?.data?.id as string;
  }

  function criar() {
    startTransition(async () => {
      const id = await garantirRascunho();
      if (!id) return;
      const r = await fetch(`/api/v1/campaigns/${id}/recipients`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filtro }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(corpo?.error?.message ?? t("Campanha criada, mas a audiência falhou."));
        router.push(`/app/campanhas/${id}`);
        return;
      }
      toast.success(`${t("Campanha criada com")} ${corpo?.data?.adicionados ?? 0} ${t("pessoa(s) na fila.")}`);
      router.push(`/app/campanhas/${id}`);
    });
  }

  function verPrevia() {
    startTransition(async () => {
      // A prévia não cria campanha: ela pergunta ao mesmo filtro, por uma rota
      // que só conta. Criar rascunho para "ver quantos são" encheria a lista de
      // campanhas abandonadas.
      const r = await fetch("/api/v1/campaigns/audiencia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filtro }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(corpo?.error?.message ?? t("Não foi possível conferir a audiência."));
        return;
      }
      setPrevia(corpo?.data ?? null);
    });
  }

  const previaDoTexto = texto.replace(/\{\{\s*saudacao\s*\}\}/g, saudacaoDaHora(new Date(), fuso));

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="campanha-nome">{t("Nome da campanha")}</Label>
        <Input
          id="campanha-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={t("Ex.: Produtores do interior de SP")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="campanha-canal">{t("Número que vai falar")}</Label>
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger id="campanha-canal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {canais.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("Quem responder cai no atendimento desse número — inclusive no agente publicado nele.")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="campanha-texto">{t("A mensagem")}</Label>
        <Textarea
          id="campanha-texto"
          rows={6}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t("Use {{saudacao}} para bom dia/boa tarde/boa noite conforme a hora do envio.")}
        />
        {texto.trim() ? (
          <div className="rounded-md border border-border bg-surface p-3">
            <p className="mb-1 text-xs text-muted-foreground">{t("Como chega agora:")}</p>
            <p className="whitespace-pre-wrap text-sm">{previaDoTexto}</p>
          </div>
        ) : null}
        {texto.trim() && !texto.includes("{{saudacao}}") ? (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            {t("Sem {{saudacao}}: um \"bom dia\" escrito à mão chega dizendo bom dia às 16h.")}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">{t("Quem vai receber")}</legend>

        {tags.length > 0 ? (
          <>
            <div className="space-y-1.5">
              <Label>{t("Tem estas etiquetas")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => alternar(comTags, setComTags, tag)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      comTags.includes(tag) ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("Não tem estas")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => alternar(semTags, setSemTags, tag)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      semTags.includes(tag) ? "border-destructive bg-destructive text-destructive-foreground" : "border-border"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("Nenhuma etiqueta nos contatos desta organização ainda.")}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campanha-ddds">{t("DDD (separe por vírgula)")}</Label>
            <Input
              id="campanha-ddds"
              value={ddds}
              onChange={(e) => {
                setDdds(e.target.value);
                setPrevia(null);
              }}
              placeholder="15, 19"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campanha-limite">{t("Quantos neste lote")}</Label>
            <Input
              id="campanha-limite"
              type="number"
              min={1}
              max={500}
              value={limite}
              onChange={(e) => {
                setLimite(e.target.value);
                setPrevia(null);
              }}
            />
          </div>
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={verPrevia} disabled={pending || !temCriterio}>
          {t("Conferir quem entra")}
        </Button>

        {previa ? (
          <div className="rounded-md border border-border bg-surface p-3 text-sm">
            <p>
              <strong>{previa.alcancados}</strong> {t("pessoa(s) batem com o filtro;")} <strong>{previa.neste_lote}</strong>{" "}
              {t("entram neste lote.")}
            </p>
            {previa.amostra.length > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Começa por:")} {previa.amostra.join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Bloqueados, anonimizados e sem telefone já estão fora desta conta.")}
            </p>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">{t("Ritmo do envio")}</legend>
        <p className="text-xs text-muted-foreground">
          {t("Lista fria não é atendimento: mandar rápido do mesmo número é o padrão que o WhatsApp bane. Vazio segue o ritmo do número.")}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="campanha-intervalo">{t("Intervalo entre mensagens (segundos)")}</Label>
          <Input
            id="campanha-intervalo"
            type="number"
            min={30}
            max={86400}
            value={intervalo}
            onChange={(e) => setIntervalo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("300s espalha 30 mensagens por 2h30, em vez de 30 minutos.")}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campanha-inicio">{t("Começa às")}</Label>
            <Input id="campanha-inicio" type="number" min={0} max={23} value={janelaInicio} onChange={(e) => setJanelaInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campanha-fim">{t("Para às")}</Label>
            <Input id="campanha-fim" type="number" min={1} max={24} value={janelaFim} onChange={(e) => setJanelaFim(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campanha-teto">{t("Máximo por dia")}</Label>
            <Input id="campanha-teto" type="number" min={1} max={1000} value={teto} onChange={(e) => setTeto(e.target.value)} />
          </div>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="campanha-base">{t("Base legal do primeiro contato")}</Label>
        <Select value={baseLegal} onValueChange={(v) => setBaseLegal(v as typeof baseLegal)}>
          <SelectTrigger id="campanha-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="consent">{t("A pessoa consentiu em receber")}</SelectItem>
            <SelectItem value="legitimate_interest">{t("Interesse legítimo (LGPD art. 7º, IX)")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {baseLegal === "legitimate_interest" ? (
        <div className="space-y-1.5">
          <Label htmlFor="campanha-lia">{t("Referência da avaliação de interesse legítimo (LIA)")}</Label>
          <Input id="campanha-lia" value={liaRef} onChange={(e) => setLiaRef(e.target.value)} placeholder="LIA-2026-01" />
          <p className="text-xs text-muted-foreground">
            {t("Onde está registrado por que esta prospecção é legítima e como a pessoa se opõe. Sem isso a campanha não começa.")}
          </p>
        </div>
      ) : null}

      <div>
        <Button onClick={criar} disabled={pending || !nome.trim() || !texto.trim() || !canal || !temCriterio}>
          {t("Criar como rascunho")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Criar não dispara nada: a campanha nasce parada e você confere a lista antes de começar.")}
        </p>
      </div>
    </div>
  );
}
