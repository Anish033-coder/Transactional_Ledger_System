const express = require('express')
const { auth } = require('../middleware/auth')
const { runReconciliation } = require('../services/ReconciliationService')

const router = express.Router()

router.get('/run', auth, async function(req, res, next) {

  try {
    const report = await runReconciliation(req.user.userId)

    return res.status(200).json({ data: report })

  } catch (error) {
    next(error)
  }

})

module.exports = router