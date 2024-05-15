/**
 * This is the main entry point for the application.
 * It creates an express server and listens for incoming webhooks from GitHub
 */
import express from 'express'
import { processEvent } from './apps/webhook_processor'
import { getDb } from './db'
import env from './env'

const app = express()
app.use(express.json())

const db = getDb(env.DB_PROVIDER)

app.get('/', (req, res) => {
  // for health checks
  res.send('Hello, World!')
})

app.post('/webhook', (req, res) => {
  console.log('Received MR webhook event');
  // express header can be string | string[]
  const gitlabToken = req.headers['x-gitlab-token'] as string;
  processEvent(req.body, gitlabToken);
  res.sendStatus(200);
});

// hard coded port for now
app.listen(3000, () => {
  console.log('Server is running on port 3000')
})
