const express    = require('express')
const cors       = require('cors')
const helmet     = require('helmet')
const rateLimit  = require('express-rate-limit')
require('dotenv').config()

const authRoutes           = require('./routes/auth')
const accountRoutes        = require('./routes/accounts')
const transactionRoutes    = require('./routes/transactions')
const reconciliationRoutes = require('./routes/reconciliation')

const app = express()

app.use(helmet())
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://transactional-lader-system.vercel.app'
  ]
}))

app.use(express.json())

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   
  max: 20,                  
  message: {
    error: {
      code:    'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again after 15 minutes'
    }
  },
  standardHeaders: true,
  legacyHeaders:   false
})

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: {
      code:    'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again after 15 minutes'
    }
  },
  standardHeaders: true,
  legacyHeaders:   false
})

app.get('/health', function(req, res) {
  res.status(200).json({
    status:  'ok',
    message: 'Server is running',
    time:    new Date().toISOString()
  })
})

app.use('/api/v1/auth',           authLimiter,    authRoutes)
app.use('/api/v1/accounts',       generalLimiter, accountRoutes)
app.use('/api/v1/transactions',   generalLimiter, transactionRoutes)
app.use('/api/v1/reconciliation', generalLimiter, reconciliationRoutes)

app.use(function(req, res) {
  res.status(404).json({
    error: {
      code:    'NOT_FOUND',
      message: 'This endpoint does not exist'
    }
  })
})

app.use(function(err, req, res, next) {
  
  console.error('Error:', err.message)

  const statusCodes = {
    'INSUFFICIENT_FUNDS':  402,
    'ACCOUNT_NOT_FOUND':   404,
    'DEST_NOT_FOUND':      404,
    'INVALID_AMOUNT':      422,
    'SAME_ACCOUNT':        422,
    'VALIDATION_ERROR':    422,
    'EMAIL_TAKEN':         409,
    'INVALID_CREDENTIALS': 401,
    'FORBIDDEN':           403,
    'ACCOUNT_INACTIVE':    422,
    'DEST_INACTIVE':       422,
    'CURRENCY_MISMATCH':   422,
    'IDEMPOTENCY_CONFLICT': 409
  }

  const statusCode = statusCodes[err.code] || 500
  const message    = statusCode === 500
    ? 'Something went wrong on our end'
    : err.message

  res.status(statusCode).json({
    error: {
      code:    err.code || 'INTERNAL_ERROR',
      message: message
    }
  })

})

const PORT = process.env.PORT || 3001

app.listen(PORT, function() {
  console.log('Server running on port ' + PORT)
  console.log('Health: http://localhost:' + PORT + '/health')
})