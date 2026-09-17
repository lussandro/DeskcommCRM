import { describe, expect, it } from 'vitest';
import { agenteTemCobranca, decidirAlegacaoDePagamento } from './alegacao-de-pagamento';

describe('decidirAlegacaoDePagamento — só a ferramenta diz "pago"; senão, humano', () => {
  it('cobrança exigível em aberto ⇒ humano (o modelo não fala)', () => {
    expect(decidirAlegacaoDePagamento({ kind: 'ok', emAberto: 1, vencidas: 1, futuras: 0 })).toEqual({ acao: 'humano', motivo: 'cobranca_em_aberto' });
    expect(decidirAlegacaoDePagamento({ kind: 'ok', emAberto: 2, vencidas: 0, futuras: 0 })).toEqual({ acao: 'humano', motivo: 'cobranca_em_aberto' });
  });
  it('nenhuma exigível em aberto ⇒ o modelo fala — parcela futura não é dívida', () => {
    expect(decidirAlegacaoDePagamento({ kind: 'ok', emAberto: 0, vencidas: 0, futuras: 0 })).toEqual({ acao: 'modelo_fala' });
    expect(decidirAlegacaoDePagamento({ kind: 'ok', emAberto: 0, vencidas: 0, futuras: 1 })).toEqual({ acao: 'modelo_fala' });
  });
  it('sem vínculo no Asaas ⇒ humano (ninguém verificou)', () => {
    expect(decidirAlegacaoDePagamento({ kind: 'sem_vinculo' })).toEqual({ acao: 'humano', motivo: 'sem_vinculo' });
  });
  it('erro do Asaas ⇒ humano, nunca o modelo', () => {
    expect(decidirAlegacaoDePagamento({ kind: 'erro', detalhe: 'timeout' })).toEqual({ acao: 'humano', motivo: 'sem_verificacao' });
  });
  it('organização sem Asaas ⇒ comportamento de antes (aditivo)', () => {
    expect(decidirAlegacaoDePagamento({ kind: 'asaas_inativo' })).toEqual({ acao: 'modelo_fala' });
  });
});

describe('agenteTemCobranca', () => {
  it('só arma para agente com ferramenta de cobrança publicada', () => {
    expect(agenteTemCobranca(['crm_get_contact', 'crm_list_contact_charges'])).toBe(true);
    expect(agenteTemCobranca(['crm_get_contact', 'crm_find_free_slots'])).toBe(false);
    expect(agenteTemCobranca([])).toBe(false);
  });
});
