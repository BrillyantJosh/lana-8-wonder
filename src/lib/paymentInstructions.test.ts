import test from 'node:test';
import assert from 'node:assert/strict';

import { cardPaymentsAllowed, formatPaymentPurpose } from './paymentInstructions';

/**
 * The buy page draws the credit-card choice only when this says so, so this is
 * the one place that decides whether a domain shows the card at all.
 *
 * It is read fail-OPEN on purpose. The card is not an extra somebody opts into
 * — it is how a large part of one domain's orders are already paid — so a flag
 * we could not read must leave it exactly where it is. Only an explicit 0 from
 * a domain admin takes it away.
 */
test('an explicit 0 is the only thing that takes the card off the page', () => {
  assert.equal(cardPaymentsAllowed(0), false, 'the domain switched the card off');
  assert.equal(cardPaymentsAllowed('0'), false, 'same answer when SQLite hands it back as text');
  assert.equal(cardPaymentsAllowed(false), false);
});

test('anything else leaves the card where it is', () => {
  assert.equal(cardPaymentsAllowed(1), true, 'the switch is on');
  assert.equal(cardPaymentsAllowed(undefined), true, 'a server that does not know the flag yet');
  assert.equal(cardPaymentsAllowed(null), true, 'a hostname with no domain row');
});

/**
 * The reference number stays first and unchanged — it is unique per order,
 * while buyer names are not. The name is added after it, never instead of it.
 */
test('the purpose is the reference first, then the name', () => {
  assert.equal(formatPaymentPurpose('1234567', 'Janez Novak'), '1234567 Janez Novak');
});

test('the purpose is still the reference before the buyer has typed a name', () => {
  assert.equal(formatPaymentPurpose('1234567', ''), '1234567');
  assert.equal(formatPaymentPurpose('1234567', '   '), '1234567');
  assert.equal(formatPaymentPurpose('1234567', null), '1234567');
});
