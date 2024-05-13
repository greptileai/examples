import * as dotenv from 'dotenv'
dotenv.config()

const env = (() => {
  const GITHUB_APP_ID = process.env.GITHUB_APP_ID
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
  const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY
  if (
    !GITHUB_APP_ID ||
    !GITHUB_PRIVATE_KEY ||
    !GITHUB_CLIENT_ID ||
    !GITHUB_CLIENT_SECRET
  ) {
    throw new Error(
      'Missing GITHUB_APP_ID or GITHUB_PRIVATE_KEY or GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET'
    )
  }
  const DB_PROVIDER: DbProvider =
    (process.env.DB_PROVIDER as DbProvider) || 'dynamodb'
  const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE
  if (DB_PROVIDER === 'dynamodb' && !DYNAMODB_TABLE) {
    throw new Error('Missing DYNAMODB_TABLE')
  }
  const GREPTILE_API_URL = process.env.GREPTILE_API_URL
  const GREPTILE_API_KEY = process.env.GREPTILE_API_KEY
  if (!GREPTILE_API_URL || !GREPTILE_API_KEY) {
    throw new Error('Missing GREPTILE_API_URL or GREPTILE_API_KEY')
  }
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    throw new Error('Missing WEBHOOK_SECRET')
  }

  const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

  return {
    GITHUB_APP_ID,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_PRIVATE_KEY,
    DB_PROVIDER,
    DYNAMODB_TABLE,
    GREPTILE_API_URL,
    GREPTILE_API_KEY,
    WEBHOOK_SECRET,
    AWS_REGION,
  }
})()

export default env
