import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

import logger from '../logger'
import env from '../env'

const TABLE_NAME = env.DYNAMODB_TABLE
const dynamodbClient = new DynamoDBClient({ region: env.AWS_REGION })

/**
 * For first party integrations we can directly interact with Greptile's dynamodb table.
 */

const dynamodb = () => {

  const get = async (repository: string, branch: string) => {
    try {
      const { Item } = await dynamodbClient.send(
        new GetItemCommand({
          TableName: 'onboard-repositories',
          Key: {
            repository: { S: repository },
            source_id: { S: `github:${branch}` },
          },
        })
      )
      return Item ? unmarshall(Item) : null
    } catch (e) {
      logger.error('Error getting repository', e)
      throw new Error('Error getting repository')
    }
  }

  const getIntegrationSettings = async (userId: string) => {
    try {
      const { Item } = await dynamodbClient.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: {
            user_id: { S: userId },
          },
        })
      )
      return Item ? unmarshall(Item) : null
    } catch (e) {
      logger.error('Error getting user', e)
      throw new Error('Error getting user')
    }
  }

  const deleteIntegration = async (
    repository: string,
    branch: string,
    integration: string
  ) => {
    try {
      await dynamodbClient.send(
        new UpdateItemCommand({
          TableName: 'onboard-repositories',
          Key: {
            repository: { S: repository },
            source_id: { S: `github:${branch}` },
          },
          ConditionExpression:
            'attribute_exists(repository) AND attribute_exists(source_id) AND attribute_exists(#integrations.#integration)',
          UpdateExpression: `REMOVE #integrations.#integration`,
          ExpressionAttributeNames: {
            '#integrations': 'integrations',
            '#integration': integration,
          },
        })
      )
    } catch (e) {
      logger.error('Error deleting integration', e)
      throw new Error('Error deleting integration')
    }
  }

  return {
    get,
    getIntegrationSettings,
    deleteIntegration,
  }
}

export default dynamodb
