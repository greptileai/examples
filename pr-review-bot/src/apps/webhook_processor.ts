// webhookEventProcessor.ts
import { type Octokit } from '@octokit/rest'
import { type AuthInterface } from '@octokit/types'

import { PullRequestReviewBot } from './pr_review'
import logger from '../logger'


// https://docs.github.com/en/webhooks/webhook-events-and-payloads
const shouldTrigger = (event: any) => {
  const actions = ['opened', 'reopened']
  const comment_actions = ['created', 'edited']
  if (event.comment) {
    return {
      trigger:
        comment_actions.includes(event.action) &&
        event.comment.body?.includes('@greptileai') &&
        event.comment.user?.type !== 'Bot',
      isComment: true,
    }
  }
  return {
    trigger: actions.includes(event.action),
    isComment: false,
  }
}

export const WebhookEventProcessor = (
  octokit: Octokit,
  auth: AuthInterface<any, any>,
  db: Db
) => {
  const processEvent = async (event: any) => {
    logger.info(
      `processing event ${event?.action} for ${event?.issue?.url || event?.pull_request?.url}`
    )
    const repository = event?.repository?.full_name?.toLowerCase()
    const branch = event?.repository?.default_branch
    const installationId = event?.installation?.id
    let greptileIntegration, githubEvent
    if (event.issue) {
      greptileIntegration = 'issueEnricher'
      githubEvent = 'issue'
    } else if (event.pull_request) {
      greptileIntegration = 'prReview'
      githubEvent = 'pull_request'
    }
    if (!greptileIntegration || !githubEvent) {
      logger.info('Unsupported event', { event })
      return
    }
    // console.log('webhook event:', repository, event.action, event.pull_request?.number, event.issue?.number)
    try {
      const response = await db.get(repository, branch)
      const { integrations } = response
      const { trigger, isComment } = shouldTrigger(event)
      if (!trigger) {
        logger.info(
          `Unsupported action: ${event.action} for ${greptileIntegration} of ${repository}, ${branch}`
        )
        return
      }
      if (!integrations?.[greptileIntegration]) {
        logger.info(
          `No integrations for ${greptileIntegration} of ${repository}, ${branch}`
        )
        return
      }
      const labels: string[] = integrations[greptileIntegration]?.labels || []
      labels.push('greptile') // always check for greptile label
      // if no labels are specified, default to all labels, else check if the issue has any of the specified labels,
      // override label check if it's a comment
      if (
        !isComment &&
        labels.length > 1 &&
        !event[githubEvent]?.labels.some((label: any) =>
          labels.includes(label.name)
        )
      ) {
        logger.info(
          `No matching labels for ${greptileIntegration} of ${repository}, ${branch}`,
          {
            labels: event[githubEvent]?.labels.map((label: any) => label.name),
            expectedLabels: labels,
          }
        )
        return
      }
      const { userId } = integrations[greptileIntegration]
      if (!userId) {
        throw new Error('No user id provided')
      }
      const userIntegration = await db.getIntegrationSettings(userId)
      const { greptileApiKey } = userIntegration
      const repositories = userIntegration.repositories.map(
        (repo: any) => repo.repository
      )
      if (!greptileApiKey) {
        throw new Error('No api key provided')
      }
      if (!repositories.includes(repository)) {
        db.deleteIntegration(repository, branch, greptileIntegration)
        throw new Error('Repository not in user repositories')
      }
      switch (githubEvent) {
        case 'issue':
          // logic for adding other types of webhook event integrations
          break;
        case 'pull_request':
          logger.info('attempting to comment on pull request')
          const prReviewBot = PullRequestReviewBot(octokit, auth)
          await prReviewBot.handlePullRequest(
            repository,
            branch,
            installationId,
            event.pull_request,
            integrations[greptileIntegration]?.instructions ?? '',
            integrations[greptileIntegration]?.comment ?? '',
            greptileApiKey
          )
      }
    } catch (error) {
      logger.error('Error processing event:', error)
    }
  }
  return {
    processEvent,
  }
}
