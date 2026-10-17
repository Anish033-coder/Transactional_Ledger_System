jest.mock('../db/db', () => ({ db: jest.fn() }))
const { db } = require('../db/db')
const { transfer, deposit } = require('../services/TransactionService')
let rows, transactions, entries, trx
beforeEach(() => {
  rows = [
    { id: 'a', user_id: 'alice', balance: '999999999999.00000001', status: 'ACTIVE', currency: 'INR' },
    { id: 'b', user_id: 'bob', balance: '0.00000000', status: 'ACTIVE', currency: 'INR' }
  ]
  transactions = []; entries = []
  const query = table => {
    let filter = () => true
    const records = () => table === 'accounts' ? rows : table === 'transactions' ? transactions : entries
    const builder = {
      where: args => { filter = row => Object.entries(args).every(([key, value]) => row[key] === value); return builder },
      whereIn: (key, values) => { filter = row => values.includes(row[key]); return builder },
      orderBy: () => builder,
      forUpdate: async () => records().filter(filter),
      first: async () => records().find(filter),
      update: async values => { records().filter(filter).forEach(row => Object.assign(row, values)) },
      insert: values => {
        if (table === 'transactions') {
          const row = { id: `tx-${transactions.length}`, ...values }; transactions.push(row)
          return { returning: async () => [row] }
        }
        entries.push(...(Array.isArray(values) ? values : [values])); return Promise.resolve()
      }
    }
    return builder
  }
  db.mockImplementation(query)
  trx = jest.fn(query)
  trx.raw = jest.fn(async (sql, bindings) => ({ rows: rows.filter(r => bindings.includes(r.id)) }))
  db.transaction = jest.fn(async callback => callback(trx))
})

test('deposit resolves successfully after writing its ledger entry', async () => {
  const result = await deposit('b', '1', null, 'bob', 'deposit-key')
  expect(result.newBalance).toBe('1.00000000')
  expect(entries).toHaveLength(1)
})

test('transfer preserves the smallest unit at large balances', async () => {
  const result = await transfer('a', 'b', '0.00000001', null, 'alice', 'exact-key')
  expect(result.newBalance).toBe('999999999999.00000000')
  expect(rows[1].balance).toBe('0.00000001')
})

test.each(['NaN', 'Infinity', '1abc', '0', '-1', '0.000000001', '1000000000000'])('rejects invalid amount %s before database writes', async amount => {
  await expect(deposit('b', amount, null, 'bob', null)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' })
  expect(entries).toHaveLength(0)
})

test('idempotent replay checks ownership before exposing the transaction', async () => {
  await transfer('a', 'b', '1', null, 'alice', 'private-key')
  await expect(transfer('a', 'b', '1', null, 'bob', 'private-key')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' })
})

test('reusing a key with a changed amount returns conflict', async () => {
  await transfer('a', 'b', '1', null, 'alice', 'same-key')
  await expect(transfer('a', 'b', '2', null, 'alice', 'same-key')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  expect(transactions).toHaveLength(1)
})

test('replay returns the original balance snapshot after another transfer', async () => {
  const first = await transfer('a', 'b', '1', null, 'alice', 'first-key')
  await transfer('a', 'b', '2', null, 'alice', 'second-key')
  const replay = await transfer('a', 'b', '1', null, 'alice', 'first-key')
  expect(replay.newBalance).toBe(first.newBalance)
  expect(replay.replayed).toBe(true)
})

test('cross-currency transfer is rejected without writes', async () => {
  rows[1].currency = 'USD'
  await expect(transfer('a', 'b', '1', null, 'alice', null)).rejects.toMatchObject({ code: 'CURRENCY_MISMATCH' })
  expect(transactions).toHaveLength(0)
})

test('destination overflow is rejected before writing', async () => {
  rows[1].balance = '999999999999.99999999'
  await expect(deposit('b', '0.00000001', null, 'bob', null)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' })
  expect(transactions).toHaveLength(0)
})
