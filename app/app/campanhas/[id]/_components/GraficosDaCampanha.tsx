"use client";

/**
 * O desempenho da campanha em três leituras, e nenhuma delas é "taxa de sucesso".
 *
 * 1. O FUNIL (barras horizontais): enviada → entregue → lida → respondeu. Cada
 *    queda tem uma causa diferente, e é a queda que diz o que consertar.
 * 2. O RITMO (linha por dia): mostra a campanha respirando dentro do
 *    anti-banimento, e é onde se vê o dia em que o cap segurou.
 * 3. OS PULOS (lista): quem não entrou na corrida, e por quê — o dado que muda
 *    a próxima lista.
 *
 * Cor: verde para o que avança, âmbar para o que parou. Nada de paleta por
 * categoria — são degraus do mesmo funil, não coisas diferentes.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useT } from "@/hooks/i18n/useT";
import type { FunilDaCampanha } from "@/lib/campanha/desempenho";

interface Props {
  funil: FunilDaCampanha;
  porDia: Array<{ dia: string; enviadas: number; responderam: number }>;
  pulos: Array<{ motivo: string; quantos: number }>;
}

const VERDE = "#2f7d53";
const VERDE_CLARO = "#6aa583";
const AMBAR = "#b07d2b";

export function GraficosDaCampanha({ funil, porDia, pulos }: Props) {
  const t = useT();

  const degraus = [
    { etapa: t("Enviadas"), valor: funil.enviadas, cor: VERDE },
    { etapa: t("Entregues"), valor: funil.entregues, cor: VERDE },
    { etapa: t("Lidas"), valor: funil.lidas, cor: VERDE_CLARO },
    { etapa: t("Responderam"), valor: funil.responderam, cor: VERDE_CLARO },
  ];

  const nadaSaiu = funil.enviadas === 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-medium">{t("O funil da campanha")}</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          {t(
            "Caiu de enviada para entregue? A lista tem número errado. De entregue para lida? A primeira linha não interessou. De lida para respondida? A oferta não é para esse público.",
          )}
        </p>
        {nadaSaiu ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("Nada saiu ainda — o funil aparece quando a primeira mensagem for enviada.")}
          </p>
        ) : (
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={degraus} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="currentColor" strokeOpacity={0.12} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="etapa" width={96} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fillOpacity: 0.06 }} />
                <Bar dataKey="valor" name={t("Pessoas")} radius={[0, 4, 4, 0]}>
                  {degraus.map((d) => (
                    <Cell key={d.etapa} fill={d.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-medium">{t("O ritmo, dia a dia")}</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          {t("Uma campanha saudável sobe devagar: o limite diário do número é o que protege a conta de ser bloqueada.")}
        </p>
        {porDia.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("Ainda não há dias com envio.")}</p>
        ) : (
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={porDia} margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.12} />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="enviadas" name={t("Enviadas")} stroke={VERDE} strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="responderam"
                  name={t("Responderam")}
                  stroke={AMBAR}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {pulos.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-1 text-sm font-medium">{t("Quem não entrou na corrida")}</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("Estes não receberam nada. O motivo diz o que consertar antes da próxima campanha.")}
          </p>
          <ul className="space-y-1 text-sm">
            {pulos.map((p) => (
              <li key={p.motivo} className="flex justify-between gap-4 border-b border-border pb-1 last:border-0">
                <span>{p.motivo}</span>
                <span className="font-semibold">{p.quantos}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
