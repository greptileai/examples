// webhookEventProcessor.ts
import logger from '../logger'
import { processGitLabEvent } from './processGitLab';

const identifyEventSource = (event: any): 'GitHub' | 'GitLab' | 'Unknown' => {
  if (event.hasOwnProperty('pull_request') || event.hasOwnProperty('issue')) {
    return 'GitHub';
  } else if (event.hasOwnProperty('object_kind') && event.object_kind === 'merge_request') {
    return 'GitLab';
  }
  return 'Unknown';
};

/**
 * Checks if the event should trigger the processEvent based on the action.
 *
 * @param event - The event object containing the details of the GitLab event.
 * @returns A boolean indicating whether the event should trigger processing.
 */
function shouldTriggerProcessEvent(event: any): boolean {
  const validActions = ['open'];
  return validActions.includes(event?.object_attributes?.action);
}

// GitLab MR events:https://docs.gitlab.com/ee/user/project/integrations/webhook_events.html#merge-request-events
export const processEvent = async (
  event: any, 
  gitlabToken: string
) => {
  // Check if the event should trigger the processing
  // if (!shouldTriggerProcessEvent(event)) {
  //   console.log('$$Event action does not require processing', { action: event?.object_attributes?.action })
  //   logger.info('$$Event action does not require processing', { action: event?.object_attributes?.action });
  //   return;
  // }

  const eventSource = identifyEventSource(event);
  if (eventSource === 'GitLab') {
    logger.info('Processing GitLab event', { event });
    await processGitLabEvent(event, gitlabToken); 
    return;
  }

  logger.info(
    `processing event ${event?.action} for ${event?.issue?.url || event?.pull_request?.url}`
  )
}