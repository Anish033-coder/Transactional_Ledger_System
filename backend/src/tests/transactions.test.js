require('dotenv').config({ path: '.env.test' })
const { db } = require('../db/db')
const { transfer, deposit } = require('../services/TransactionService')

async function createTestAccount(email, startingBalance) {
  const [user] = await db('users')
    .insert({ email, password_hash: 'fake-hash-for-tests' })
    .returning('*')

  const [account] = await db('accounts')
    .insert({ user_id: user.id, name: 'Test Account', balance: startingBalance })
    .returning('*')

  return { user, account }
}

describe('Transfer Logic', () => {

  beforeEach(async () => {
    await db.raw('TRUNCATE TABLE ledger_entries, transactions, accounts, users RESTART IDENTITY CASCADE;');
  })

  afterAll(async () => {
    await db.destroy()
    await new Promise(resolve => setTimeout(resolve, 500))
  })

  test('successfully moves money and creates ledger entries', async () => {

    const anish = await createTestAccount('anish@test.com', 1000)
    const rahul = await createTestAccount('rahul@test.com', 0)

    const result = await transfer(
      anish.account.id,
      rahul.account.id,
      '200',
      'test transfer',
      anish.user.id,
      'test-key-001'
    )

    // transaction was created and marked completed
    expect(result.transaction.status).toBe('COMPLETED')
    expect(result.newBalance).toBe('800.00000000')

    // check the actual balances in the database
    const anishAfter = await db('accounts').where({ id: anish.account.id }).first()
    const rahulAfter = await db('accounts').where({ id: rahul.account.id }).first()

    expect(parseFloat(anishAfter.balance)).toBe(800)
    expect(parseFloat(rahulAfter.balance)).toBe(200)

    const entries = await db('ledger_entries')
      .where({ transaction_id: result.transaction.id })

    expect(entries.length).toBe(2) 

    const debitEntry  = entries.find(e => e.entry_type === 'DEBIT')
    const creditEntry = entries.find(e => e.entry_type === 'CREDIT')

    expect(parseFloat(debitEntry.balance_after)).toBe(800)   
    expect(parseFloat(creditEntry.balance_after)).toBe(200)  
  })

  test('fails with INSUFFICIENT_FUNDS when balance too low', async () => {

    const anish = await createTestAccount('anish2@test.com', 100)
    const rahul = await createTestAccount('rahul2@test.com', 0)

 
    await expect(
      transfer(anish.account.id, rahul.account.id, '500', null, anish.user.id, 'test-key-002')
    ).rejects.toThrow()

    const anishAfter = await db('accounts').where({ id: anish.account.id }).first()
    const rahulAfter = await db('accounts').where({ id: rahul.account.id }).first()

    expect(parseFloat(anishAfter.balance)).toBe(100) 
    expect(parseFloat(rahulAfter.balance)).toBe(0)   

    const txns = await db('transactions').where({ idempotency_key: 'test-key-002' })
    expect(txns.length).toBe(0)
  })

  test('duplicate idempotency key replays original response without double charging', async () => {

    const anish = await createTestAccount('anish3@test.com', 1000)
    const rahul = await createTestAccount('rahul3@test.com', 0)

    const sameKey = 'test-key-duplicate-003'

    const firstCall  = await transfer(anish.account.id, rahul.account.id, '100', null, anish.user.id, sameKey)
    const secondCall = await transfer(anish.account.id, rahul.account.id, '100', null, anish.user.id, sameKey)

    expect(firstCall.transaction.id).toBe(secondCall.transaction.id)

    expect(secondCall.replayed).toBe(true)

    
    const anishAfter = await db('accounts').where({ id: anish.account.id }).first()
    expect(parseFloat(anishAfter.balance)).toBe(900)

    const txns = await db('transactions').where({ idempotency_key: sameKey })
    expect(txns.length).toBe(1)
  })

  test('simultaneous duplicate requests all replay one committed transfer', async () => {
    const sender = await createTestAccount('race-sender@test.com', 1000)
    const receiver = await createTestAccount('race-receiver@test.com', 0)
    const results = await Promise.all(Array.from({ length: 10 }, () => transfer(sender.account.id, receiver.account.id, '100', null, sender.user.id, 'concurrent-key')))
    expect(new Set(results.map(r => r.transaction.id)).size).toBe(1)
    expect(results.filter(r => !r.replayed)).toHaveLength(1)
    expect(results.every(r => r.newBalance === '900.00000000')).toBe(true)
    const balance = await db('accounts').where({ id: receiver.account.id }).first()
    expect(balance.balance).toBe('100.00000000')
  })

  test('opposite-direction transfers complete and conserve balances', async () => {
    const a = await createTestAccount('opposite-a@test.com', 1000)
    const b = await createTestAccount('opposite-b@test.com', 1000)
    await Promise.all([
      transfer(a.account.id, b.account.id, '100', null, a.user.id, 'opposite-a'),
      transfer(b.account.id, a.account.id, '100', null, b.user.id, 'opposite-b')
    ])
    const accounts = await db('accounts').orderBy('id')
    expect(accounts.map(a => a.balance)).toEqual(['1000.00000000', '1000.00000000'])
  })

  test('deposit completes and concurrent duplicates create one credit', async () => {
    const a = await createTestAccount('deposit@test.com', 0)
    const results = await Promise.all(Array.from({ length: 5 }, () => deposit(a.account.id, '0.00000001', null, a.user.id, 'deposit-race')))
    expect(results.every(r => r.newBalance === '0.00000001')).toBe(true)
    expect(await db('ledger_entries').select('*')).toHaveLength(1)
  })

  test('reconciliation is scoped to the caller and catches a missing transfer ledger', async () => {
    const { runReconciliation } = require('../services/ReconciliationService')
    const a = await createTestAccount('reconcile-a@test.com', 0)
    const b = await createTestAccount('reconcile-b@test.com', 0)
    await deposit(a.account.id, '100', null, a.user.id, 'reconcile-deposit')
    await db('accounts').where({ id: b.account.id }).update({ balance: '1.00000000' })
    expect((await runReconciliation(a.user.id)).healthy).toBe(true)
    expect((await runReconciliation(b.user.id)).balance_mismatches).toHaveLength(1)
    await db('accounts').where({ id: b.account.id }).update({ balance: '0.00000001' })
    expect((await runReconciliation(b.user.id)).balance_mismatches).toHaveLength(1)
    const result = await transfer(a.account.id, b.account.id, '1', null, a.user.id, 'reconcile-transfer')
    await db('ledger_entries').where({ transaction_id: result.transaction.id }).del()
    expect((await runReconciliation(a.user.id)).unbalanced_transactions).toHaveLength(1)
  })

  test('a ledger-write failure rolls back already updated balances and transaction', async () => {
    const a = await createTestAccount('rollback-a@test.com', 1000)
    const b = await createTestAccount('rollback-b@test.com', 0)
    await db.raw('ALTER TABLE ledger_entries ADD CONSTRAINT test_reject_amount CHECK (amount <> 123)')
    try {
      await expect(transfer(a.account.id, b.account.id, '123', null, a.user.id, 'rollback-key')).rejects.toThrow()
      expect((await db('accounts').where({ id: a.account.id }).first()).balance).toBe('1000.00000000')
      expect((await db('accounts').where({ id: b.account.id }).first()).balance).toBe('0.00000000')
      expect(await db('transactions').where({ idempotency_key: 'rollback-key' })).toHaveLength(0)
      expect(await db('ledger_entries').select('*')).toHaveLength(0)
    } finally {
      await db.raw('ALTER TABLE ledger_entries DROP CONSTRAINT test_reject_amount')
    }
  })

})