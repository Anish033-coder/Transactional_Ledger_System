const { db } = require('../db/db')

const SCALE = 100000000n
const MAX_UNITS = 10n ** 20n - 1n // PostgreSQL NUMERIC(20, 8)
function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}
function units(value) {
  if (typeof value !== 'string' || !/^\d{1,12}(\.\d{1,8})?$/.test(value)) {
    fail('INVALID_AMOUNT', 'Use a decimal string with up to 12 integer and 8 fractional digits')
  }
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0'))
}
function decimal(value) {
  return `${value / SCALE}.${(value % SCALE).toString().padStart(8, '0')}`
}

async function move(type, fromAccountId, toAccountId, amount, note, userId, key) {
  const quantity = units(amount)
  if (quantity <= 0n) fail('INVALID_AMOUNT', 'Amount must be greater than zero')
  if (type === 'TRANSFER' && fromAccountId === toAccountId) fail('SAME_ACCOUNT', 'You cannot transfer to the same account')
  if (key != null && (typeof key !== 'string' || !key.trim() || key.length > 255)) {
    fail('VALIDATION_ERROR', 'Idempotency key must contain 1 to 255 characters')
  }
  return db.transaction(async trx => {
    // Serialize the same key across all writers before locking accounts. The UNIQUE
    // constraint remains the final guard. Hash collisions only cause extra waiting.
    if (key) await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [key])
    const ids = type === 'TRANSFER' ? [fromAccountId, toAccountId] : [toAccountId]
    const accounts = await trx('accounts').whereIn('id', ids).orderBy('id').forUpdate()
    const ownedId = fromAccountId || toAccountId
    const owned = accounts.find(a => a.id === ownedId)
    if (!owned || owned.user_id !== userId) fail('ACCOUNT_NOT_FOUND', 'Account not found or does not belong to you')

    if (key) {
      const existing = await trx('transactions').where({ idempotency_key: key }).first()
      if (existing) {
        if (existing.type !== type || existing.from_account_id !== fromAccountId ||
            existing.to_account_id !== toAccountId || units(existing.amount) !== quantity ||
            existing.note !== (note || null)) {
          fail('IDEMPOTENCY_CONFLICT', 'This key was already used for a different request')
        }
        const entry = await trx('ledger_entries').where({ transaction_id: existing.id, account_id: ownedId }).first()
        if (!entry) fail('INTERNAL_ERROR', 'Missing ledger receipt')
        return { transaction: existing, newBalance: entry.balance_after, replayed: true }
      }
    }
    const destination = accounts.find(a => a.id === toAccountId)
    if (!destination) fail('DEST_NOT_FOUND', 'Destination account not found')
    if (owned.status !== 'ACTIVE') fail('ACCOUNT_INACTIVE', 'Your account is not active')
    if (destination.status !== 'ACTIVE') fail('DEST_INACTIVE', 'Destination account is not active')
    if (type === 'TRANSFER' && owned.currency !== destination.currency) fail('CURRENCY_MISMATCH', 'Accounts must use the same currency')
    const sourceUnits = units(owned.balance)
    const destinationUnits = units(destination.balance) + quantity
    if (type === 'TRANSFER' && sourceUnits < quantity) fail('INSUFFICIENT_FUNDS', 'You do not have enough balance for this transfer')
    if (destinationUnits > MAX_UNITS) fail('INVALID_AMOUNT', 'Destination balance exceeds supported precision')
    const newBalance = decimal(type === 'TRANSFER' ? sourceUnits - quantity : destinationUnits)
    const [transaction] = await trx('transactions').insert({
      from_account_id: fromAccountId, to_account_id: toAccountId, amount: decimal(quantity),
      type, status: 'COMPLETED', note: note || null, idempotency_key: key || null, completed_at: new Date()
    }).returning('*')
    if (type === 'TRANSFER') {
      await trx('accounts').where({ id: fromAccountId }).update({ balance: newBalance, updated_at: new Date() })
    }
    await trx('accounts').where({ id: toAccountId }).update({ balance: decimal(destinationUnits), updated_at: new Date() })
    const entries = [{ transaction_id: transaction.id, account_id: toAccountId, entry_type: 'CREDIT', amount: decimal(quantity), balance_after: decimal(destinationUnits) }]
    if (type === 'TRANSFER') entries.push({ transaction_id: transaction.id, account_id: fromAccountId, entry_type: 'DEBIT', amount: decimal(quantity), balance_after: newBalance })
    await trx('ledger_entries').insert(entries)
    return { transaction, newBalance, replayed: false }
  })
}

const transfer = (from, to, amount, note, user, key) => move('TRANSFER', from, to, amount, note, user, key)
const deposit = (account, amount, note, user, key) => move('DEPOSIT', null, account, amount, note, user, key)
module.exports = { transfer, deposit }
