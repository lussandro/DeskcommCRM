import { describe, expect, it } from 'vitest';
import { escolherFunilDeEntrada, type FunilCandidato } from '@/lib/leads/nascimento-do-lead';
import { corpo } from '@/app/api/v1/pipelines/_funis';

const BACCO = 'canal-2220';
const CHATCORE = 'canal-7781';
const NOVO = 'canal-1900';

function f(over: Partial<FunilCandidato> & { id: string }): FunilCandidato {
  return { is_default: false, position: 1000, channel_session_id: null, ...over };
}

describe('escolherFunilDeEntrada — o funil pertence a um número', () => {
  it('sem número no funil: tudo como antes — o padrão da organização recebe', () => {
    const funis = [f({ id: 'vendas', is_default: true }), f({ id: 'clientes', position: 2000 })];
    expect(escolherFunilDeEntrada(funis, BACCO)).toBe('vendas');
    expect(escolherFunilDeEntrada(funis, CHATCORE)).toBe('vendas');
    expect(escolherFunilDeEntrada(funis, null)).toBe('vendas');
  });

  it('o caso do dono: os dois funis amarrados ao 2220 — o 7781 não entra em nenhum', () => {
    const funis = [
      f({ id: 'vendas', is_default: true, channel_session_id: BACCO }),
      f({ id: 'clientes', position: 2000, channel_session_id: BACCO }),
    ];
    expect(escolherFunilDeEntrada(funis, BACCO)).toBe('vendas');
    expect(escolherFunilDeEntrada(funis, CHATCORE)).toBeNull();
    expect(escolherFunilDeEntrada(funis, NOVO)).toBeNull();
    expect(escolherFunilDeEntrada(funis, null)).toBeNull();
  });

  it('cada número com o seu funil: cada card no seu negócio', () => {
    const funis = [
      f({ id: 'vendas-bacco', is_default: true, channel_session_id: BACCO }),
      f({ id: 'vendas-chatcore', channel_session_id: CHATCORE }),
    ];
    expect(escolherFunilDeEntrada(funis, BACCO)).toBe('vendas-bacco');
    expect(escolherFunilDeEntrada(funis, CHATCORE)).toBe('vendas-chatcore');
  });

  it('o funil do número ganha do padrão sem número', () => {
    const funis = [
      f({ id: 'geral', is_default: true }),
      f({ id: 'do-numero', channel_session_id: CHATCORE }),
    ];
    expect(escolherFunilDeEntrada(funis, CHATCORE)).toBe('do-numero');
    expect(escolherFunilDeEntrada(funis, BACCO)).toBe('geral');
  });

  it('vários funis do mesmo número: o marcado como padrão; sem padrão, o primeiro da ordem', () => {
    const comPadrao = [
      f({ id: 'a', position: 1000, channel_session_id: BACCO }),
      f({ id: 'b', position: 2000, is_default: true, channel_session_id: BACCO }),
    ];
    expect(escolherFunilDeEntrada(comPadrao, BACCO)).toBe('b');
    const semPadrao = [
      f({ id: 'b', position: 2000, channel_session_id: BACCO }),
      f({ id: 'a', position: 1000, channel_session_id: BACCO }),
    ];
    expect(escolherFunilDeEntrada(semPadrao, BACCO)).toBe('a');
  });

  it('organização sem funil nenhum: não nasce card', () => {
    expect(escolherFunilDeEntrada([], BACCO)).toBeNull();
  });

  it('funil padrão de OUTRO número não serve de rede: o padrão só vale sem número', () => {
    const funis = [f({ id: 'vendas-chatcore', is_default: true, channel_session_id: CHATCORE })];
    expect(escolherFunilDeEntrada(funis, BACCO)).toBeNull();
    expect(escolherFunilDeEntrada(funis, CHATCORE)).toBe('vendas-chatcore');
  });

  it('position nula não atropela quem tem ordem', () => {
    const funis = [
      f({ id: 'sem-ordem', position: null, channel_session_id: BACCO }),
      f({ id: 'primeiro', position: 10, channel_session_id: BACCO }),
    ];
    expect(escolherFunilDeEntrada(funis, BACCO)).toBe('primeiro');
  });

  it('a resposta da API leva o número do funil — senão a tela volta a "Todos" ao salvar', () => {
    // Guarda do achado do Codex: `corpo()` descartava `channel_session_id`, e o
    // `FunisClient` aplica a resposta da mutação como fonte da verdade — o select
    // voltava para "Todos os números" logo depois de salvar.
    const resposta = corpo([
      { id: 'vendas', name: 'Vendas', slug: 'vendas', position: 1000, is_default: true, is_archived: false, channel_session_id: BACCO },
      { id: 'clientes', name: 'Clientes', slug: 'clientes', position: 2000, is_default: false, is_archived: false },
    ]);
    expect(resposta.pipelines[0]!.channel_session_id).toBe(BACCO);
    expect(resposta.pipelines[1]!.channel_session_id).toBeNull();
  });
});
