type DbProvider = 'dynamodb' | 'local'
type Db = {
  get: (repository: string, branch: string) => Promise<any>
  getIntegrationSettings: (userId: string) => Promise<any>
  deleteIntegration: (
    repository: string,
    branch: string,
    integration: string
  ) => Promise<void>
  // query: (repository: string) => Promise<any>
  // update: (repository: string, data: { [key: string]: any[] }) => Promise<void>
}

type RepositorySettings = {
  integrations: string[]
}
