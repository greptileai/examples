// Usage options:
// $ node smee.js
// $ node smee.js 3000

const SmeeClient = require('smee-client')

// get port from first command line arg
const port = process.argv[2] || 3000

const smee = new SmeeClient({
  source: 'https://smee.io/dAuEmtnj9tNNCK6f',
  target: `http://localhost:${port}/webhook`,
  logger: console,
})

smee.start()
