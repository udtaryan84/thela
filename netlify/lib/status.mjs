// Works out an order's state from what Cashfree reports.
// Cashfree has no "failed" order: a failed attempt leaves the order ACTIVE, so read the latest payment.
export async function cashfreeState(cf, orderId) {
  const [order, payments] = await Promise.all([cf.getOrder(orderId), cf.getPayments(orderId).catch(() => [])]);
  if (order.order_status === 'PAID') return 'PAID';
  if (order.order_status === 'EXPIRED' || order.order_status === 'TERMINATED') return 'FAILED';
  const list = Array.isArray(payments) ? payments : [];
  if (list.some((p) => p.payment_status === 'SUCCESS')) return 'PAID';
  const latest = list
    .slice()
    .sort((a, b) => String(b.payment_time || '').localeCompare(String(a.payment_time || '')))[0];
  if (latest && (latest.payment_status === 'FAILED' || latest.payment_status === 'USER_DROPPED')) return 'FAILED';
  return 'CREATED';
}

// The one rule for moving an order on: a payment always wins; a failure only marks an order still waiting.
// Returns true when the order changed and needs saving.
export function applyOutcome(order, outcome) {
  if (outcome === 'PAID' && (order.status === 'CREATED' || order.status === 'FAILED')) {
    order.status = 'PAID';
    order.paidAt = new Date().toISOString();
    return true;
  }
  if (outcome === 'FAILED' && order.status === 'CREATED') {
    order.status = 'FAILED';
    return true;
  }
  return false;
}
