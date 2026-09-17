import { describe, expect, it } from 'vitest';
import { separarCodigosDePagamento, temCodigoDePagamento } from './codigos-de-pagamento';

// O payload REAL que o agente mandou em produção (17/09/2026), com espaços no nome
// do recebedor — é o que torna impossível achar o fim do código "no olho".
const PIX_REAL =
  '00020101021226800014br.gov.bcb.pix2558pix.asaas.com/qr/cobv/4adf964c-0750-489c-8059-67c4856b9fb25204000053039865802BR5919BACCO SISTEMAS LTDA6008Sao Jose61088811516062070503***63047A44';

describe('separarCodigosDePagamento', () => {
  it('a mensagem real de produção: o Pix fica sozinho, texto antes e depois separados', () => {
    const corpo = `Consigo sim — segue o Pix copia e cola para pagar agora: ${PIX_REAL} Se preferir, também pode pagar pelo link: https://www.asaas.com/i/sat3kpeifpi8p7fp`;
    const pedacos = separarCodigosDePagamento(corpo);
    expect(pedacos).toHaveLength(3);
    expect(pedacos[0]).toBe('Consigo sim — segue o Pix copia e cola para pagar agora:');
    expect(pedacos[1]).toBe(PIX_REAL);
    expect(pedacos[2]).toBe('Se preferir, também pode pagar pelo link: https://www.asaas.com/i/sat3kpeifpi8p7fp');
  });

  it('o código sozinho continua sozinho', () => {
    expect(separarCodigosDePagamento(PIX_REAL)).toEqual([PIX_REAL]);
  });

  it('linha digitável de boleto com máscara sai sozinha', () => {
    const linha = '23793.38128 60007.827136 95000.063305 1 99760000003900';
    const pedacos = separarCodigosDePagamento(`Segue a linha digitável: ${linha} É só copiar no app do banco.`);
    expect(pedacos).toEqual(['Segue a linha digitável:', linha, 'É só copiar no app do banco.']);
  });

  it('linha digitável sem máscara (só dígitos) também', () => {
    const linha = '23793381286000782713695000063305199760000003900';
    expect(separarCodigosDePagamento(`copia ai ${linha}`)).toEqual(['copia ai', linha]);
  });

  it('texto comum não é tocado', () => {
    for (const t of [
      'Sua mensalidade deste mês ficou em R$ 39,00, com vencimento no dia 10/09.',
      'Ainda não consta o pagamento no sistema.',
      'O pedido 000201 foi enviado ontem.',
      'Meu CNPJ é 13.030.349/0001-18',
      'Liguei para 4899357781 e ninguém atendeu',
    ]) {
      expect(separarCodigosDePagamento(t)).toEqual([t]);
      expect(temCodigoDePagamento(t)).toBe(false);
    }
  });

  it('dois códigos na mesma mensagem: cada um no seu pedaço', () => {
    const corpo = `Pix: ${PIX_REAL} ou boleto: 23793.38128 60007.827136 95000.063305 1 99760000003900`;
    const pedacos = separarCodigosDePagamento(corpo);
    expect(pedacos).toHaveLength(4);
    expect(pedacos[1]).toBe(PIX_REAL);
    expect(pedacos[3]).toBe('23793.38128 60007.827136 95000.063305 1 99760000003900');
  });

  it('temCodigoDePagamento é verdadeiro só quando há código junto de texto', () => {
    expect(temCodigoDePagamento(`segue: ${PIX_REAL}`)).toBe(true);
    expect(temCodigoDePagamento('bom dia')).toBe(false);
  });
});
