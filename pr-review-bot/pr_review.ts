// pullRequestReviewBot.ts

// import axios from 'axios';
import { Octokit } from '@octokit/rest';
import env from '../env';
import { AuthInterface } from '@octokit/types';
import logger from '../logger';

export const PullRequestReviewBot = (octokit: Octokit, auth: AuthInterface<any, any>) => {
  async function handlePullRequest(repository: string, branch: string, installationId: string, pullRequest: any, customPrompt: string, greptileApiKey: string) {
    logger.info('Handling pull request:', { pullRequest })
    const prNumber = pullRequest.number;
    const [repoOwner, repoName] = repository.split('/');

    const { token } = await auth({
      type: "installation",
      installationId: installationId,
    })

    logger.info('Handling pull request', { prNumber, repository, token });

    try {
      const changedFiles = await octokit.pulls.listFiles({
        headers: {
          authorization: `Bearer ${token}`
        },
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
      });

      for (const file of changedFiles.data) {
        try {
          const fileContents = await octokit.repos.getContent({
            headers: {
              authorization: `Bearer ${token}`
            },
            owner: repoOwner,
            repo: repoName,
            path: file.filename,
            ref: pullRequest.head.sha,
          });
          if (file.patch && 'content' in fileContents.data) {
            const { comment, change } = await generateReviewComment(pullRequest, repository, branch, token, customPrompt, greptileApiKey, file.filename, file.patch, fileContents.data.content);
            // JSON.parse(reviewComment) and check if meaningful change via useful field, then post comment to PR
            if (change) {
              await octokit.pulls.createReviewComment({
                headers: {
                  authorization: `Bearer ${token}`
                },
                owner: repoOwner,
                repo: repoName,
                pull_number: prNumber,
                body: comment,
                commit_id: pullRequest.head.sha,
                path: file.filename,
                subject_type: 'file',
              });
            }
          }
        } catch (error) {
          logger.error('Error handling file:', error);
        }
      } 
    } catch (error) {
      logger.error('Error handling pull request:', error);
    }
  }

  async function generateReviewComment(payload: any, repository: string, branch: string, token: string, customPrompt: string, greptileApiKey: string, fileName: string, fileDiff: string, fileContent: string) {
    try {
      const decodedFileContent = Buffer.from(fileContent, 'base64').toString('utf-8');
      logger.info('file diff and content:', { fileDiff: fileDiff, fileContent: decodedFileContent})
      const maxRetries = 3;
      let retryCount = 0;
      let reviewComment = '';

      while (retryCount < maxRetries) {
        try {
          const formattedPayload = {
            messages: [
              {
                role: "system",
                content: customPrompt || "You are an advanced GitHub Pull Request Review Bot designed to assist developers by providing insightful and actionable comments on changed files in a pull request. Your primary goal is to review the file change in detail alongside the relevant code context from the repository to identify any concerns or improvements for the changes as a professional senior engineer would when reviewing a pull request. NO generic or high-level commentary. NO resummarizing of the code. NO comments on how a change enhances readability or clarity. Rather focus on delivering clear, concise, and relevant information to provide any potential errors or changes necessary based on the code context. Return a json object with two fields, change and comment. (schema: { change: boolean, comment: string }) The change field is a boolean which is true when there is a meaningful or concerning comment to be made as described above and should be set to false when there isn't anything meaningful enough to be commented on (the changes are minimal or the file is short). The comment field will contain the actual contents of the comment which should be formatted in markdown. You should present your comment in a professional and technical tone, using markdown formatting where appropriate to enhance readability. Make at most three actionable comments. No yapping, stay concise and straight to the point, no final notes, conclusions, abstracts, summarizations, or obvious advice that distract from adding value to the pull request. Do not ask for further information or engage in open-ended conversation, as you are not a chat bot. Keep all points to a max of two sentences. Below are some sample outputs:\nMeaningful changes:\n{ 'change': true, 'comment': '###Potential Issues\n 1. *Validation of parameter in POST Method*: There's no validation to check if the `test` parameter is provided in the request body. This could lead to an attempt to update the DynamoDB item with an undefined `test`, potentially causing an error or unintended behavior.\n 2. *Unmarshalling without Null Check*: The code `const result = unmarshall(response.Item!);` assumes that `response.Item` is not null. It's safer to add a null check before unmarshalling to avoid runtime errors if the item does not exist.\n 3. }\n{ 'change': true, 'comment': '###Potential Issues\n There is a possibility of stack overflow attack on line 49' }\n\nNon-meaningful chnages (change: false):\n{ 'change': false, 'comment': '###Suggested Improvement\nThis update in the README.md file enhances clarity. This change is beneficial as it provides readers with a clearer understanding of the content covered in the README.md. However, consider expanding this description further, if space permits. This could provide potential readers with a more comprehensive overview of what to expect.}\n{ 'change': false, 'comment': '' }"
              },
              {
                role: "user",
                content: `Repository: ${repository}:\nPull Request Title: ${payload.title}\nPull Request Body: ${payload.body}\nFile name: ${fileName}\nChanges: ${fileDiff}\nFile Content: ${decodedFileContent}`
              }
            ],
            repositories: [
              {
                remote: "github",
                repository: repository,
                branch: branch,
              }
            ],
            genius: retryCount === 0, // Enable genius mode only for the first request
            jsonMode: true,
          };

          const response = await fetch(`${env.GREPTILE_API_URL}/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${greptileApiKey}`,
              'X-GitHub-Token': token,
            },
            body: JSON.stringify(formattedPayload),
          });

          if (!response.ok) {
            throw new Error('Failed to generate review comment');
          }

          const data = await response.json();
          logger.info('Review comment data:', data);
          return JSON.parse(data.message)
        } catch (error) {
          logger.error('Error generating review comment:', error);
          retryCount++;
          if (retryCount === maxRetries) {
            throw new Error('Error generating review comment. Max retries exceeded');
          }
        }
      }
      return JSON.parse(reviewComment);
    } catch (error) {
      logger.error('Error generating review comment (toplevel):', error);
      throw new Error('Error generating review comment (toplevel)');
    }
  }

  return {
    handlePullRequest,
  };
};