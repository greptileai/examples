// pullRequestReviewBot.ts

// import axios from 'axios';
import { Octokit } from '@octokit/rest'
import env from '../env'
import { AuthInterface } from '@octokit/types'
import logger from '../logger'

type FileChange = {
  sha: string
  filename: string
  status:
    | 'added'
    | 'removed'
    | 'modified'
    | 'renamed'
    | 'copied'
    | 'changed'
    | 'unchanged'
  additions: number
  deletions: number
  changes: number
  blob_url: string
  raw_url: string
  contents_url: string
  patch?: string | undefined
  previous_filename?: string | undefined
}

type Comment = {
  path: string
  position?: number | undefined
  body: string
  line?: number | undefined
  side?: string | undefined
  start_line?: number | undefined
  start_side?: string | undefined
}

const disallowedCommentPrefixes = [
  'Ensure',
  'Verify',
  'Validate',
  'Consider',
  'Review',
  'Confirm',
]

export const PullRequestReviewBot = (
  octokit: Octokit,
  auth: AuthInterface<any, any>
) => {
  async function handlePullRequest(
    repository: string,
    branch: string,
    installationId: string,
    pullRequest: any,
    customPrompt: string,
    customComment: string,
    greptileApiKey: string
  ) {
    logger.info(`Handling pull request for ${repository} ${branch} ${installationId} ${pullRequest.number}`)
    const prNumber = pullRequest.number
    const [repoOwner, repoName] = repository.split('/')

    const { token, expiresAt } = await auth({
      type: 'installation',
      installationId: installationId,
      refresh: true,
    })
    logger.info(`Got token, expiresAt: ${expiresAt}`)

    try {
      const changedFiles: { data: FileChange[] } =
        await octokit.pulls.listFiles({
          headers: {
            authorization: `Bearer ${token}`,
          },
          owner: repoOwner,
          repo: repoName,
          pull_number: prNumber,
        })

      console.log(JSON.stringify(changedFiles.data, null, 2))
      const lineComments: Comment[] = []
      const overallComments = []

      for (const file of changedFiles.data) {
        try {
          const lines = await octokit.repos
            .getContent({
              headers: {
                authorization: `Bearer ${token}`,
              },
              owner: repoOwner,
              repo: repoName,
              path: file.filename,
              ref: pullRequest.head.ref,
            })
            .then((response) => {
              const content = Buffer.from(
                (response.data as any).content.split('\n').join(''),
                'base64'
              ).toString('utf-8')
              const lines = content.split('\n')
              return lines
            })
            .catch(() => [])

          const greptileComments = await generateFileComments(
            pullRequest,
            changedFiles.data,
            file,
            lines,
            greptileApiKey,
            token
          )
          console.log('Greptile comments:', greptileComments)

          lineComments.push(
            ...(greptileComments.comments
              .map((comment: any) => {
                if (
                  disallowedCommentPrefixes.some((prefix) =>
                    comment.comment.startsWith(prefix)
                  )
                ) {
                  return null
                }

                const [start_line, line] =
                  file.status === 'removed'
                    ? [undefined, 1]
                    : comment.start === undefined ||
                        comment.start === comment.end
                      ? [undefined, comment.end]
                      : comment.start + 15 > comment.end
                        ? [comment.start, comment.end]
                        : [undefined, comment.start]

                return {
                  path: file.filename,
                  body: comment.comment,
                  start_line,
                  line,
                  side: file.status === 'removed' ? 'LEFT' : 'RIGHT',
                }
              })
              .filter(Boolean) as Comment[])
          )

          overallComments.push({
            filepath: file.filename,
            status: file.status,
            summary: greptileComments.summary,
          })
        } catch (error) {
          logger.error('Error handling file:', error)
        }
      }

      console.log('Will generate overall comments:', overallComments)
      const overallComment = await generateOverallComment(
        pullRequest,
        overallComments,
        greptileApiKey,
        token
      )
      console.log('Overall comment:', overallComment)

      console.log('Sending request', {
        headers: {
          authorization: `Bearer ${token}`,
        },
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
        body: customComment + (customComment ? '\n' : '') + overallComment,
        event: 'COMMENT',
        comments: lineComments,
      })

      try {
        await octokit.pulls.createReview({
          headers: {
            authorization: `Bearer ${token}`,
          },
          owner: repoOwner,
          repo: repoName,
          pull_number: prNumber,
          body: overallComment,
          event: 'COMMENT',
          comments: lineComments,
        })
      } catch (error) {
        logger.info('Will try making a single overall comment')

        // group by file
        const groupedLineComments = lineComments.reduce(
          (acc, comment) => {
            if (!acc[comment.path]) {
              acc[comment.path] = []
            }
            acc[comment.path].push(comment)
            return acc
          },
          {} as { [key: string]: Comment[] }
        )

        const overallCommentWithLineComments = `${overallComment}\n\n${lineComments.length > 0 ? `## Comments\n\n` : ''}${Object.entries(
          groupedLineComments
        )
          .map(([path, comments]) => {
            if (comments.length === 0) {
              return ''
            }
            return `**${path}**\n${comments.map((comment) => `- ${comment.start_line ? `Lines ${comment.start_line} - ${comment.line}` : `Line ${comment.line}`}: ${comment.body}`).join('\n')}`
          })
          .join('\n\n')}`

        await octokit.pulls.createReview({
          headers: {
            authorization: `Bearer ${token}`,
          },
          owner: repoOwner,
          repo: repoName,
          pull_number: prNumber,
          body: overallCommentWithLineComments,
          event: 'COMMENT',
        })
      }
    } catch (error) {
      logger.error('Error handling pull request:', error)
    }
  }

  const generateFileComments = async (
    pullRequest: any,
    changedFiles: FileChange[],
    file: FileChange,
    lines: string[],
    greptileApiKey: string,
    githubToken: string
  ) => {
    try {
      const maxRetries = 3
      let retryCount = 0

      while (retryCount < maxRetries) {
        try {
          const response = await fetch(`${env.GREPTILE_API_URL}/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${greptileApiKey}`,
              'X-GitHub-Token': githubToken,
            },
            body: JSON.stringify({
              messages: [
                {
                  role: 'system',
                  content: `Generate a review of changes made in the following file, which is part of a GitHub pull request. Consider the file's usage and context within the rest of the codebase to determine whether any files that depend on it will be affected. Respond with a JSON object with the following schema: { summary: string, comments: [{ start: number, end: number, comment: string }] }. The 'summary' field should contain a summary of the important changes made in this file, potential pitfalls, and unforseen consequences, considering the context of the rest of the codebase. The 'comments' field should contain a list of specific and actionable review comments to add to the pull request, that include bug fixes, spelling corrections, etc. Respond in a professional and friendly tone. ONLY comment on the most pressing, important issues. The majority of files will not require any comments at all. Do not tell the author to check, verify, consider, or ensure things related to code or dependencies, since these types of comments are vague and unhelpful. Do not make subjective suggestions that are not pertinent to the logic and execution of the code. Do not comment on configuring or monitoring infrastructure or environments outside of the codebase. Do not tell the user to ensure code matches standards, or fits with other code, unless you specifically see evidence of a problem. Do not tell the user to verify the code works (or anything like this). Assume the author has added/deleted things intentionally in this PR, after considering their effects. Assume all design decisions are deliberate, so you should not suggest the author revisit or evaluate choices they have made. Assume that functions, classes, etc in dependencies or other modules are correct, and support any new or modified features in this file (do not tell the user to check them). Do not tell the author to add docstrings, or to change them unless they are specifically incorrect as already written. Similarly, do not make comments about logs or how to make them better. Never describe the change that was made, since that is obvious based on where the comment is located. Only include explicit and objective code-related corrections. The 'start' and 'end' fields should be the start and end lines to comment on in the new file (unless the file was deleted). Comment only on the relevant line or lines, not entire sections of the diff. The start and end lines need to be in the same change hunk, and they shouldn't span more than 20 lines. If the whole file was deleted, only make one comment for the whole file. If there is an issue and you cannot see the file contents or write a meaningful review, the summary should simply say that there was an error, and you should not write any comments. Each comment should be extremely short, direct, and to the point. As concise as humanly possible. Do not write a comment if it's not extremely valuable. ONLY comment on ${file.filename}. There will be separate opportunities to comment on other changed files.`,
                },
                {
                  role: 'user',
                  content: `Repository: ${pullRequest.head.repo.full_name}:\nPull request to merge branch \`${pullRequest.head.ref}\` into branch \`${pullRequest.base.ref}\`\nPull Request Title: ${pullRequest.title}${pullRequest.body ? `\nPull Request Body: ${pullRequest.body}` : ''}\nFile name: ${file.filename}${file.previous_filename ? `\nPrevious file name: ${file.previous_filename}` : ''}\nOther files changed in this PR (updates not included below): ${changedFiles.map((file) => file.filename).join(', ')}\n\nChanges: ${file.patch}\n\nFile with line numbers:\n\n\`\`\`\n${lines.map((line, index) => `${index + 1}: ${line}`).join('\n')}\n\`\`\`\n\n`,
                },
              ],
              repositories: [
                {
                  remote: 'github',
                  repository: pullRequest.base.repo.full_name,
                  branch: pullRequest.base.repo.default_branch,
                },
              ],
              genius: retryCount === 0, // Enable genius mode only for the first request
              jsonMode: true,
            }),
          })

          if (!response.ok) {
            throw new Error('Failed to review file change')
          }

          const data = await response.json()
          logger.info('Review file change data:', data)
          return JSON.parse(data.message)
        } catch (error) {
          logger.error('Error reviewing file change:', error)
          retryCount++
          if (retryCount === maxRetries) {
            throw new Error('Error reviewing file change. Max retries exceeded')
          }
        }
      }
    } catch (error) {
      logger.error(`Error reviewing file change: ${file.filename}, ${error}`)
      throw new Error('Error reviewing file change')
    }
  }

  const generateOverallComment = async (
    pullRequest: any,
    comments: any[],
    greptileApiKey: string,
    githubToken: string
  ) => {
    const maxRetries = 3
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        const response = await fetch(`${env.GREPTILE_API_URL}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${greptileApiKey}`,
            'X-GitHub-Token': githubToken,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `Write a very short overall comment for this pull request, based on the file change summaries given below. Summarize the changes made in this pull request in order of importance, in no more than 4 short bullet points, to help guide someone through the things that have changed. Also include up to 2 optional bullet points on potential pitfalls or unforeseen consequences, opportunities for code reuse (optional), and any other helpful notes. The aim is to provide a summary of the pull request, to help a reviewer understand the changes made, along with the potential impact of those changes. Do not include anything generic or vague. Everything you write should be meaningful or immediately actionable. Respond in a professional and friendly tone. ONLY comment on the most important changes. Most summaries will be 1 to 2 bullet points. Do not tell the author to check, verify, consider, or ensure things related to code or dependencies, since these types of comments are vague and unhelpful. Do not make subjective suggestions. Do not comment on configuring or monitoring infrastructure or environments outside of the codebase. Do not tell the user to ensure code matches standards, or fits with other code, unless you specifically see evidence of a problem. Do not tell the user to verify the code works (or anything like this). Assume the author has added/deleted things intentionally, considering their effects. Answer in less than 50 to 100 words if possible. Do not give broad or open-ended tasks to the reviewer. Only give context of how the changes fit into the larger codebase, if available.\n\nRepository: ${pullRequest.head.repo.full_name}:\nPull request to merge branch \`${pullRequest.head.ref}\` into branch \`${pullRequest.base.ref}\`\nPull Request Title: ${pullRequest.title}${pullRequest.body ? `\nPull Request Body: ${pullRequest.body}` : ''}\n\n${comments.map((comment) => `File: ${comment.filepath} (${comment.status})\nSummary of changes: ${comment.summary}`).join('\n\n')}\n\n`,
              },
            ],
            repositories: [
              {
                remote: 'github',
                repository: pullRequest.base.repo.full_name,
                branch: pullRequest.base.repo.default_branch,
              },
            ],
            genius: true,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to review pull request')
        }

        const data = await response.json()
        return data.message
      } catch (error) {
        logger.error('Error reviewing pull request:', error)
        retryCount++
        if (retryCount === maxRetries) {
          throw new Error('Error reviewing pull request. Max retries exceeded')
        }
      }
    }
  }

  return {
    handlePullRequest,
  }
}
