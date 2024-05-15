import axios from 'axios';
import env from '../env'
import { CommentPayload, Position, PostCommentProps, type FileDiff, type GreptileQueryResponse, Comment } from '../types';
import logger from '../logger';

// GitLab get file content: https://docs.gitlab.com/ee/api/repository_files.html#get-file-from-repository
export async function fetchAndDecodeFileContents(
    projectId: string, 
    fileChanges: FileDiff[], 
    gitlabToken: string,
    ref: string="main"): Promise<string[]>
{
  const fileContents: string[] = [];

  for (const fileChange of fileChanges) {
    const url = `${env.GITLAB_API_BASE_URL}/projects/${projectId}/repository/files/${fileChange.new_path}?ref=${ref}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'PRIVATE-TOKEN': gitlabToken,
        },
      });

      // Decode the Base64 content
      const decodedContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
      fileContents.push(decodedContent);
    } catch (error) {
      console.error(`Error fetching content for file ${fileChange.new_path}:`, error);
      // Optionally, push an error message or handle it as needed
    }
  }

  return fileContents;
}

/**
 * Fetches comments for file changes using the Greptile API.
 * This function processes multiple file changes and retrieves review comments for each change.
 *
 * @param originalFileContents - An array of original file content.
 * @param fileChanges - An array of file change objects containing details about the changes.
 * @param gitlabToken - GitLab access token for API call
 * @param greptileApiKey - Greptile API Key
 * @returns A promise that resolves to an array of comments retrieved from the Greptile API.
 */
export async function fetchGreptileComments(
  originalFileContents: string[],
  fileChanges: FileDiff[],
  gitlabToken: string,
  greptileApiKey: string,
  sourceBranch: string,
  projectUrl: string
): Promise<Comment[]> {
  const commentsArray: Comment[] = [];

  for (let i = 0; i < fileChanges.length; i++) {
    const fileChange = fileChanges[i];
    const originalContent = originalFileContents[i]; // Assuming the order matches

    try {
      const response = await axios.post<GreptileQueryResponse>(`${env.GREPTILE_API_URL}/query`, {
        messages: [
          {
            role: 'system',
            content: `Generate a review of changes made in the following file, which is part of a GitLab merge request. Consider the file's usage and context within the rest of the codebase to determine whether any files that depend on it will be affected. Respond with a JSON object with the following schema: { summary: string, comments: [{ start: number, end: number, comment: string, modify_type: "add" | "delete" }] }. The 'summary' field should contain a summary of the important changes made in this file, potential pitfalls, and unforeseen consequences, considering the context of the rest of the codebase. The 'comments' field should contain a list of specific and actionable review comments to add to the merge request, that include bug fixes, spelling corrections, etc. The modify_type key should indicate if the code is added or deleted. Respond in a professional and friendly tone. ONLY comment on the most pressing, important issues. The majority of files will not require any comments at all. Do not tell the author to check, verify, consider, or ensure things related to code or dependencies, since these types of comments are vague and unhelpful. Do not make subjective suggestions that are not pertinent to the logic and execution of the code. Do not comment on configuring or monitoring infrastructure or environments outside of the codebase. Do not tell the user to ensure code matches standards, or fits with other code, unless you specifically see evidence of a problem. Do not tell the user to verify the code works (or anything like this). Assume the author has added/deleted things intentionally in this MR, after considering their effects. Assume all design decisions are deliberate, so you should not suggest the author revisit or evaluate choices they have made. Assume that functions, classes, etc in dependencies or other modules are correct, and support any new or modified features in this file (do not tell the user to check them). Do not tell the author to add docstrings, or to change them unless they are specifically incorrect as already written. Similarly, do not make comments about logs or how to make them better. Never describe the change that was made, since that is obvious based on where the comment is located. Only include explicit and objective code-related corrections. The 'start' and 'end' fields should be the start and end lines to comment on in the new file (unless the file was deleted). Comment only on the relevant line or lines, not entire sections of the diff. The start and end lines need to be in the same change hunk, and they shouldn't span more than 20 lines. If the whole file was deleted, only make one comment for the whole file. If there is an issue and you cannot see the file contents or write a meaningful review, the summary should simply say that there was an error, and you should not write any comments. Each comment should be extremely short, direct, and to the point. As concise as humanly possible. Do not write a comment if it's not extremely valuable. ONLY comment on ${fileChange.new_path}. There will be separate opportunities to comment on other changed files.`,
          },
          {
            role: 'user',
            content: `File path: ${fileChange.new_path}\n\nChanges:\n\n${fileChange.diff}\n\nOriginal content:\n\n${originalContent}`,
          },
        ],
        repositories: [
          {
            remote: 'gitlab',
            repository: projectUrl,
            branch: sourceBranch,
          },
        ],
        genius: true,
        jsonMode: true,
      }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${greptileApiKey}`,
          'X-GitLab-Token': gitlabToken, // Assuming Greptile API supports a custom header for GitLab token
        },
      });

      if (response.status === 200 && response.data) {
        commentsArray.push(JSON.parse(response.data.message));
        console.log('Greptile API response:', typeof(response.data.message), response.data.message);
      } else {
        throw new Error('Failed to fetch comments from Greptile API');
      }
    } catch (error) {
      console.error(`Error fetching comments for file ${fileChange.new_path}:`, error);
      commentsArray.push({"comment": "An error occurred while fetching comments."});
    }
  }

  return commentsArray;
}


/**
 * Fetches a single comment for all file changes using the Greptile API.
 * This function processes multiple file changes and retrieves a single review comment that summarizes all changes.
 *
 * @param originalFileContents - An array of original contents of the files before changes.
 * @param fileChanges - An array of file change objects containing details about the changes.
 * @param gitlabToken - The GitLab token used for authenticating with the Greptile API.
 * @param greptileApiKey - The API key used for accessing the Greptile API.
 * @returns A promise that resolves to a single comment summarizing all changes retrieved from the Greptile API.
 */
export async function fetchGreptileOverallComment(
  originalFileContents: string[],
  fileChanges: FileDiff[],
  gitlabToken: string,
  greptileApiKey: string,
  sourceBranch: string,
  projectUrl: string,
): Promise<string> {
  // Combine all file changes and their original contents into a single request payload.
  const combinedChanges = fileChanges.map((fileChange, index) => ({
    path: fileChange.new_path,
    diff: fileChange.diff,
    originalContent: originalFileContents[index],
  }));

  // Construct the message content for the API request.
  const messageContent = combinedChanges.map(change => (
    `File path: ${change.path}\n\nChanges:\n\n${change.diff}\n\nOriginal content:\n\n${change.originalContent}`
  )).join('\n\n');

  try {
    // Make a single POST request to the Greptile API to fetch a summary comment for all file changes.
    const response = await axios.post<GreptileQueryResponse>(`${env.GREPTILE_API_URL}/query`, {
      messages: [
        {
          role: 'system',
          content: `Generate a review of all changes made in the following files, which are part of a GitLab merge request. Consider the usage and context of these files within the rest of the codebase to determine whether any files that depend on them will be affected. Respond with a JSON object with the following schema: { summary: string, comments: [{ start: number, end: number, comment: string }] }. The 'summary' field should contain a summary of the important changes made in these files, potential pitfalls, and unforeseen consequences, considering the context of the rest of the codebase. The 'comments' field should contain a list of specific and actionable review comments to add to the merge request, that include bug fixes, spelling corrections, etc. Respond in a professional and friendly tone. ONLY comment on the most pressing, important issues. The majority of files will not require any comments at all. Do not tell the author to check, verify, consider, or ensure things related to code or dependencies, since these types of comments are vague and unhelpful. Do not make subjective suggestions that are not pertinent to the logic and execution of the code. Do not comment on configuring or monitoring infrastructure or environments outside of the codebase. Do not tell the user to ensure code matches standards, or fits with other code, unless you specifically see evidence of a problem. Do not tell the user to verify the code works (or anything like this). Assume the author has added/deleted things intentionally in this MR, after considering their effects. Assume all design decisions are deliberate, so you should not suggest the author revisit or evaluate choices they have made. Assume that functions, classes, etc in dependencies or other modules are correct, and support any new or modified features in these files (do not tell the user to check them). Do not tell the author to add docstrings, or to change them unless they are specifically incorrect as already written. Similarly, do not make comments about logs or how to make them better. Never describe the change that was made, since that is obvious based on where the comment is located. Only include explicit and objective code-related corrections. The 'start' and 'end' fields should be the start and end lines to comment on in the new files (unless the files were deleted). Comment only on the relevant line or lines, not entire sections of the diff. The start and end lines need to be in the same change hunk, and they shouldn't span more than 20 lines. If the whole file was deleted, only make one comment for the whole file. If there is an issue and you cannot see the file contents or write a meaningful review, the summary should simply say that there was an error, and you should not write any comments. Each comment should be extremely short, direct, and to the point. As concise as humanly possible. Do not write a comment if it's not extremely valuable. ONLY comment on the provided file paths. There will be separate opportunities to comment on other changed files.`,
        },
        {
          role: 'user',
          content: messageContent,
        },
      ],
      repositories: [
        {
          remote: 'gitlab',
          repository: projectUrl,
          branch: sourceBranch,
        },
      ],
      genius: true,
      jsonMode: true,
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${greptileApiKey}`,
        'X-GitLab-Token': gitlabToken, // Assuming Greptile API supports a custom header for GitLab token.
      },
    });

    // Check if the response status is 200 and the data is available.
    if (response.status === 200 && response.data) {
      // Return the summary message from the response data.
      return response.data.message;
    } else {
      throw new Error('Failed to fetch summary comment from Greptile API');
    }
  } catch (error) {
    // Log any errors that occur during the API request.
    console.error('Error fetching summary comment:', error);
    // Return an error message.
    return 'An error occurred while fetching the summary comment.';
  }
}

/**
 * Posts a comment or multiple comments to a GitLab merge request.
 *
 * @param projectId - The ID of the GitLab project.
 * @param mrId - The ID of the merge request.
 * @param comments - A string or an array of strings representing the comments.
 * @param gitlabToken - The GitLab token used for authentication.
 * @returns A promise that resolves when all comments have been posted.
 */
// GitLab create MR comment: https://docs.gitlab.com/ee/api/notes.html#create-new-merge-request-note
// GitLab create comment on MR on specific files and lines
// https://docs.gitlab.com/ee/api/discussions.html#create-a-new-thread-in-the-merge-request-diff
export async function postGitLabComments(
  projectId: string,
  mrId: string,
  comments: string | string[],
  gitlabToken: string
): Promise<void> {
  const commentsArray = Array.isArray(comments) ? comments : [comments];

  for (const comment of commentsArray) {
    await axios.post(`${env.GITLAB_API_BASE_URL}/projects/${projectId}/merge_requests/${mrId}/notes`, 
      { 
        body: comment 
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Private-Token': gitlabToken,
        },
      }
    );
  }
}

export function extractPathWithNamespace(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.slice(1); // Remove the leading slash
  } catch (error) {
    logger.error('Invalid project URL', { url });
    throw new Error('Invalid project URL');
  }
}

/**
 * Fetches the latest commit SHA of the main branch from a GitLab project.
 * 
 * @param {string} projectId - The ID of the GitLab project.
 * @param {string} accessToken - The personal access token for authenticating with the GitLab API.
 * @returns {Promise<string>} - A promise that resolves to the latest commit SHA of the main branch.
 * @throws Will throw an error if the request fails or the response is not valid.
 */
export async function getMainBranchLatestCommitSHA(
  projectId: string, 
  gitlabToken: string
): Promise<string> {
  const apiUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/branches/main`;

  // Fetch the branch details from GitLab API
  const response = await fetch(apiUrl, {
    headers: {
      'PRIVATE-TOKEN': gitlabToken
    }
  });

  // Check if the response status is OK (200-299)
  if (!response.ok) {
    throw new Error(`Failed to fetch branch details: ${response.statusText}`);
  }

  // Parse the response JSON
  const branchData = await response.json();

  // Extract and return the latest commit SHA
  if (branchData && branchData.commit && branchData.commit.id) {
    return branchData.commit.id;
  } else {
    throw new Error('Invalid response structure: Commit SHA not found.');
  }
}


/**
 * Posts a comment to a merge request discussion in GitLab.
 * 
 * @param {PostCommentProps} options - The options for posting the comment.
 * @returns {Promise<void>} - A promise that resolves when the comment is successfully posted.
 * @throws Will throw an error if the request fails.
 */
async function postCommentToMR(options: PostCommentProps): Promise<void> {
  const { projectId, mergeRequestId, accessToken, body, position } = options;
  const apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestId}/discussions`;

  const formData = new URLSearchParams();
  formData.append('body', body);
  formData.append('position[position_type]', position.position_type);

  if (position.new_line !== undefined) {
    formData.append('position[new_line]', position.new_line.toString());
  }

  if (position.old_line !== undefined) {
    formData.append('position[old_line]', position.old_line.toString());
  }

  formData.append('position[base_sha]', position.base_sha);
  formData.append('position[head_sha]', position.head_sha);
  formData.append('position[start_sha]', position.start_sha);
  formData.append('position[new_path]', position.new_path);
  formData.append('position[old_path]', position.old_path);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'PRIVATE-TOKEN': accessToken,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  console.log(
    position.base_sha, 
    position.head_sha, 
    position.start_sha, 
    position.new_path, 
    position.old_path, 
    position.new_line, 
    position.old_line,
    body
  )

  if (!response.ok) {
    console.log('Failed to post comment:');
    console.log(await response.json());
    throw new Error(`Failed to post comment: ${await response.json()}`);
  }
}

/**
 * Processes and posts multiple comments to a merge request discussion in GitLab.
 * 
 * @param {string} projectId - The ID of the GitLab project.
 * @param {number} mergeRequestId - The ID of the merge request.
 * @param {string} accessToken - The personal access token for authenticating with the GitLab API.
 * @param {CommentPayload[]} comments - An array of comment payloads.
 * @param {string} beforeSha - The SHA of the base commit.
 * @param {string} afterSha - The SHA of the head commit.
 * @returns {Promise<void>} - A promise that resolves when all comments are successfully posted.
 * @throws Will throw an error if any request fails.
 */
export async function postMultipleComments(
  projectId: string,
  mergeRequestId: number,
  accessToken: string,
  diffs: FileDiff[],
  comments: any,
  beforeSha: string,
  afterSha: string
): Promise<void> {
  for (let i = 0; i < comments.length; i++) {
    const commentPayload = comments[i];
    const diff = diffs[i]; 
    console.log("@@", comments)

    for (const comment of commentPayload.comments) {
      const position: Position = {
        position_type: 'text',
        base_sha: beforeSha,
        head_sha: afterSha,
        start_sha: beforeSha,
        new_path: diff.new_path,
        old_path: diff.old_path,
      };

      if (comment.modify_type === 'add') {
        position.new_line = comment.start;
      } else if (comment.modify_type === 'delete') {
        position.old_line = comment.start;
      }

      const body = comment.comment;
      const options: PostCommentProps = {
        projectId,
        mergeRequestId,
        accessToken,
        body,
        position
      };

      try {
        await postCommentToMR(options);
        console.log('Comment posted successfully.');
      } catch (error) {
        console.error('Error posting comment:', error);
      }
    }
  }
}

