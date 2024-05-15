import dynamodb from './dynamodb'

export const getDb = (provider: DbProvider): Db => {
  switch (provider) {
    case 'dynamodb':
    default:
      return dynamodb()
  }
}
