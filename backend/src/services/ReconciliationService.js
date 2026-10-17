const { db } = require('../db/db')

async function runReconciliation(userId) {
  if (!userId) {
    const error = new Error('A user is required for reconciliation')
    error.code = 'FORBIDDEN'
    throw error
  }
  const [balances, transfers, pending] = await Promise.all([
    db.raw(`
      SELECT a.id AS account_id, a.name AS account_name, a.balance AS stored_balance,
        COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END), 0) AS ledger_sum,
        ABS(a.balance - COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END), 0)) AS discrepancy
      FROM accounts a LEFT JOIN ledger_entries le ON le.account_id = a.id
      WHERE a.user_id = ?
      GROUP BY a.id, a.name, a.balance
      HAVING a.balance <> COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END), 0)
      ORDER BY discrepancy DESC
    `, [userId]),
    db.raw(`
      SELECT t.id AS transaction_id, t.amount AS transaction_amount, t.type AS transaction_type, t.created_at,
        COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) AS total_debits,
        COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0) AS total_credits,
        ABS(COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE -le.amount END), 0)) AS imbalance
      FROM transactions t LEFT JOIN ledger_entries le ON le.transaction_id = t.id
      WHERE t.type = 'TRANSFER' AND t.status = 'COMPLETED'
        AND EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = ? AND a.id IN (t.from_account_id, t.to_account_id))
      GROUP BY t.id, t.amount, t.type, t.created_at
      HAVING COUNT(*) FILTER (WHERE le.entry_type = 'DEBIT') <> 1
        OR COUNT(*) FILTER (WHERE le.entry_type = 'CREDIT') <> 1
        OR COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) <> t.amount
        OR COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0) <> t.amount
        OR COUNT(*) FILTER (WHERE le.entry_type = 'DEBIT' AND le.account_id <> t.from_account_id) > 0
        OR COUNT(*) FILTER (WHERE le.entry_type = 'CREDIT' AND le.account_id <> t.to_account_id) > 0
      ORDER BY t.created_at DESC
    `, [userId]),
    db.raw(`
      SELECT t.id, t.from_account_id, t.to_account_id, t.amount, t.created_at
      FROM transactions t
      WHERE t.status = 'PENDING' AND t.created_at < NOW() - INTERVAL '5 minutes'
        AND EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = ? AND a.id IN (t.from_account_id, t.to_account_id))
      ORDER BY t.created_at ASC
    `, [userId])
  ])
  return {
    healthy: !balances.rows.length && !transfers.rows.length && !pending.rows.length,
    ran_at: new Date().toISOString(),
    balance_mismatches: balances.rows,
    unbalanced_transactions: transfers.rows,
    stuck_transactions: pending.rows,
    summary: { balance_mismatch_count: balances.rows.length, unbalanced_txn_count: transfers.rows.length, stuck_txn_count: pending.rows.length }
  }
}
module.exports = { runReconciliation }
