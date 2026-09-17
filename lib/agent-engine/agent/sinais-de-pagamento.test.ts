import { describe, expect, it } from 'vitest';
import { clienteAlegaPagamento } from './sinais-de-pagamento';

// Frases MEDIDAS pelas revisões adversariais (17/09/2026): as 28 alegações reais que a
// versão anterior perdia em 19, e os falsos positivos que ela tinha.
const ALEGA = [
  'paguei',
  'já paguei o boleto',
  'acabei de pagar',
  'tá pago',
  'quitei ontem',
  'fiz o pix',
  'já fiz o pix',
  'fiz a transferência',
  'transferi hoje cedo',
  'depositei na conta',
  'mandei o comprovante',
  'enviei comprovante',
  'já fiz o pagamento',
  'fiz o pagamento ontem',
  'pagamento realizado',
  'já efetuei o pagamento',
  'mandei o pix',
  'já mandei o pix agora',
  'tá quitado',
  'segue o comprovante',
  'comprovante em anexo',
  'acabei de fazer o pix',
  'pix enviado',
  'já caiu na conta de vocês',
  'pagamento feito',
  'tá tudo pago',
  'pagamento ok',
  'fiz o depósito',
  'enviei o pagamento',
  'já passei o pix',
  'realizei o pagamento',
  'o pagamento já foi',
  'já foi pago',
  'não consegui ontem, mas hoje paguei',
  // 4ª revisão adversarial: famílias que a versão anterior perdia
  'mandei por pix',
  'paguei via boleto',
  'pagamento já realizado',
  'meu marido pagou',
  'minha esposa fez o pix',
  'o boleto foi pago pela minha esposa',
  'pguei',
  'já pg',
  'pgto feito',
  'pagto ok',
];
const NAO_ALEGA = [
  'paguei não',
  'quanto paguei?',
  'paguei caro no vinho',
  'se eu já paguei me avisa',
  'paguei da última vez, agora quero de novo',
  'vou pagar amanhã',
  'pago quanto?',
  'ainda não paguei',
  'não paguei ainda',
  'nunca paguei isso',
  'quando fiz o pagamento veio errado',
  'vou fazer o pix hoje à noite',
  'preciso pagar o boleto',
  'não mandei o comprovante ainda',
  'bom dia, tudo bem?',
  'quero a segunda via do boleto',
];

describe('clienteAlegaPagamento — a porta da interceptação', () => {
  for (const f of ALEGA) it(`alega: ${f}`, () => expect(clienteAlegaPagamento(f)).toBe(true));
  for (const f of NAO_ALEGA) it(`não alega: ${f}`, () => expect(clienteAlegaPagamento(f)).toBe(false));
  it('alegação em mensagem anterior ainda conta quando o texto é a junção das pendentes', () => {
    expect(clienteAlegaPagamento('já paguei\nvocê viu?')).toBe(true);
  });
});
