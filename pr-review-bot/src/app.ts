/**
 * This is the main entry point for the application.
 * It creates an express server and listens for incoming webhooks from GitHub
 */
import express from 'express'
import { App } from 'octokit'
import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import { createNodeMiddleware } from '@octokit/webhooks'
import { WebhookEventProcessor } from './apps/webhook_processor'
import { getDb } from './db'
import http from 'http'
import env from './env'
import { AuthInterface } from '@octokit/types'
import logger from './logger'

const app = express()
app.use(express.json())

const octokit = new Octokit({
  appId: env.GITHUB_APP_ID,
  privateKey: env.GITHUB_PRIVATE_KEY,
  webhooks: {
    secret: env.WEBHOOK_SECRET,
  },
})
const auth: AuthInterface<any, any> = createAppAuth({
  appId: env.GITHUB_APP_ID,
  clientId: env.GITHUB_CLIENT_ID,
  clientSecret: env.GITHUB_CLIENT_SECRET,
  privateKey: env.GITHUB_PRIVATE_KEY,
})
const db = getDb(env.DB_PROVIDER)
const webhookEventProcessor = WebhookEventProcessor(octokit, auth, db)

app.get('/', (req, res) => {
  // for health checks
  res.send('Hello, World!')
})

app.post('/webhook', (req, res) => {
  console.log('Received webhook event')
  webhookEventProcessor.processEvent(req.body)
  res.sendStatus(200)
})

// hard coded port for now
app.listen(3000, () => {
  console.log('Server is running on port 3000')
})
