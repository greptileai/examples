import * as dotenv from 'dotenv'
dotenv.config()

const env = (() => {
  // const GITLAB_TOKEN = process.env.GITLAB_TOKEN
  const DB_PROVIDER: DbProvider =
    (process.env.DB_PROVIDER as DbProvider) || 'dynamodb'
  const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE
  if (DB_PROVIDER === 'dynamodb' && !DYNAMODB_TABLE) {
    // throw new Error('Missing DYNAMODB_TABLE')
    console.log('Missing DYNAMODB_TABLE')
  }
  const GREPTILE_API_URL = process.env.GREPTILE_API_URL
  const GREPTILE_API_KEY = process.env.GREPTILE_API_KEY
  if (!GREPTILE_API_URL || !GREPTILE_API_KEY) {
    throw new Error('Missing GREPTILE_API_URL or GREPTILE_API_KEY')
  }

  const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
  const GITLAB_API_BASE_URL = 'https://gitlab.com/api/v4';

  return {
    DB_PROVIDER,
    DYNAMODB_TABLE,
    GREPTILE_API_URL,
    GREPTILE_API_KEY,
    AWS_REGION,
    GITLAB_API_BASE_URL,
  }
})()

export default env
