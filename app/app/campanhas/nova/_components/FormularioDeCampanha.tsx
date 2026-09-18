"use client";

/**
 * Criar campanha — número, texto, base legal e audiência.
 *
 * A base legal é campo de PRIMEIRA classe, não letra miúda: é ela que separa
 * prospecção de spam, e quem dispara precisa declarar em que se apoia antes de
 * a primeira mensagem sair. Interesse legítimo abre o campo da LIA, porque é a
 * referência que responde "com base em quê você me mandou isto?".
 *
 * A audiência entra por telefone, um por linha: é o formato que o operador já
 * tem na mão (planilha, lista do contador) e que ele consegue conferir com os
 * próprios olhos antes de apertar. Só entra quem JÁ é contato da organização —
 * criar contato aqui esconderia um import dentro de um gesto de campanha.
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

interface Props {
  canais: Array<{ id: string; rotulo: string }>;
}

export function FormularioDeCampanha({ canais }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [canal, setCanal] = useState(canais[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [baseLegal, setBaseLegal] = useState<"consent" | "legitimate_interest">("legitimate_interest");
  const [liaRef, setLiaRef] = useState("");
  const [telefones, setTelefones] = useState("");

  const linhasDeTelefone = telefones
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  function criar() {
    startTransition(async () => {
      const r = await fetch("/api/v1/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: nome,
          channel_session_id: canal,
          template_body: texto,
          base_legal: baseLegal,
          lia_ref: baseLegal === "legitimate_interest" ? liaRef : null,
        }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(corpo?.error?.message ?? t("Não foi possível criar a campanha."));
        return;
      }
      const id = corpo?.data?.id as string;

      if (linhasDeTelefone.length > 0) {
        const busca = await fetch("/api/v1/campaigns/resolver-telefones", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ telefones: linhasDeTelefone }),
        });
        const achados = await busca.json().catch(() => null);
        const ids = (achados?.data?.contact_ids ?? []) as string[];
        const naoAchados = (achados?.data?.nao_encontrados ?? []) as string[];
        if (ids.length > 0) {
          await fetch(`/api/v1/campaigns/${id}/recipients`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contact_ids: ids }),
          });
        }
        if (naoAchados.length > 0) {
          // Falar a verdade na hora: número que não é contato NÃO entrou, e o
          // operador precisa saber antes de achar que a lista inteira está lá.
          toast.warning(
            `${naoAchados.length} ${t("número(s) não são contatos desta organização e ficaram de fora.")}`,
          );
        }
      }

      toast.success(t("Campanha criada como rascunho."));
      router.push(`/app/campanhas/${id}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="campanha-nome">{t("Nome da campanha")}</Label>
        <Input id="campanha-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("Ex.: Produtores do interior de SP")} />
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
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t("Use {{saudacao}} para bom dia/boa tarde/boa noite conforme a hora do envio.")}
        />
        <p className="text-xs text-muted-foreground">
          {t("A saudação é resolvida na hora do envio: escrever \"bom dia\" fixo faria a mensagem das 16h chegar errada. Quem não tiver nome no cadastro é pulado quando a mensagem usa o nome — mensagem com buraco denuncia disparo automático.")}
        </p>
      </div>

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

      <div className="space-y-1.5">
        <Label htmlFor="campanha-telefones">{t("Quem vai receber")}</Label>
        <Textarea
          id="campanha-telefones"
          rows={6}
          value={telefones}
          onChange={(e) => setTelefones(e.target.value)}
          placeholder={"+5515999999999\n+5519988888888"}
        />
        <p className="text-xs text-muted-foreground">
          {linhasDeTelefone.length > 0
            ? `${linhasDeTelefone.length} ${t("número(s) na lista. Só entram os que já são contatos desta organização.")}`
            : t("Um telefone por linha. Só entram os que já são contatos desta organização.")}
        </p>
      </div>

      <Button onClick={criar} disabled={pending || !nome.trim() || !texto.trim() || !canal}>
        {t("Criar como rascunho")}
      </Button>
      <p className="text-xs text-muted-foreground">
        {t("Criar não dispara nada: a campanha nasce parada e você confere a lista antes de começar.")}
      </p>
    </div>
  );
}
