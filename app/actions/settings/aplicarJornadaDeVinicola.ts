"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { aplicarJornada, type RelatorioDaJornada } from "@/lib/vertical/vinicola/aplicar";
import { ehChaveDeJornada } from "@/lib/vertical/vinicola";

export type ResultadoDaAplicacao =
  | { ok: true; relatorio: RelatorioDaJornada }
  | { ok: false; erro: string };

/**
 * Ativar uma jornada pela tela.
 *
 * Papel: `admin`. É o papel do aplicador inteiro — não há caminho em que parte
 * do pacote entra com `manager` e o resto falha.
 *
 * A organização sai da SESSÃO. Aceitá-la do body daria a qualquer admin de
 * qualquer tenant a chave para semear o pacote no tenant do vizinho, porque o
 * aplicador roda com admin client e bypassa a RLS.
 *
 * ⚠️ O MODO SUPORTE NÃO ESCREVE, e esta guarda não estava no brief. Sem ela,
 * quem entra num tenant por impersonação com papel de `admin` passa pelo teste
 * de papel e semeia funil, mensagens e cadências no banco do cliente — que é
 * exatamente a escrita que `supportWriteError` existe para recusar em toda ação
 * do repo (`updatePipelineConfig` é o precedente).
 */
export async function aplicarJornadaDeVinicola(formData: FormData): Promise<ResultadoDaAplicacao> {
  const user = await requireAuth();
  // O TEXTO REAL da recusa, que já é uma frase pronta ("Este acompanhamento
  // permite somente leitura."). Trocá-lo por um genérico esconderia de quem
  // acompanha por que o botão não obedeceu.
  const recusaDeSuporte = supportWriteError(user.support);
  if (recusaDeSuporte) return { ok: false as const, erro: recusaDeSuporte };
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false as const, erro: "Sua sessão expirou. Entre de novo." };
  const podeAplicar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;
  if (!podeAplicar) {
    return { ok: false as const, erro: "Só quem administra a empresa pode ativar uma jornada." };
  }

  const chave = String(formData.get("jornada") ?? "");
  if (!ehChaveDeJornada(chave)) return { ok: false as const, erro: "Jornada desconhecida." };

  const relatorio = await aplicarJornada(activeOrg.orgId, chave, user.id);
  revalidatePath("/app/settings/tenant/jornadas");
  return { ok: true as const, relatorio };
}
