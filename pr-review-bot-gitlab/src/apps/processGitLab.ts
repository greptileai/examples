// Import axios for making HTTP requests
import axios from 'axios';
import { extractPathWithNamespace, fetchAndDecodeFileContents, fetchGreptileComments, fetchGreptileOverallComment, getMainBranchLatestCommitSHA, postGitLabComments, postMultipleComments } from './util_gitlab';
import env from '../env'
import logger from '../logger';
import { CommentPayload, type Comment } from '../types';

// Define the GitLab API base URL

// Function to process GitLab Merge Request events
// This function will be called when a GitLab MR event is received, then
// 1. Fetch the diffs files in the MR
// 2: Fetch the original file content for each changed file
// 3: Call the Greptile API to comments (individual comment and overall comment)
// 4: Post the generated comments to the MR


// GitLab MR events:https://docs.gitlab.com/ee/user/project/integrations/webhook_events.html#merge-request-events
// GitLab get MR diffs: https://docs.gitlab.com/ee/api/merge_requests.html#list-merge-request-diffs
// GitLab create MR comment: https://docs.gitlab.com/ee/api/notes.html#create-new-merge-request-note
// GitLab get file content: https://docs.gitlab.com/ee/api/repository_files.html#get-file-from-repository
export const processGitLabEvent = async (event: any, gitlabToken: string) => {
  // Extract necessary information from the event
  const projectId = event.project.id;
  const mrId = event.object_attributes.iid;
  const sourceBranch = event.object_attributes.source_branch
  const targetBranch = event.object_attributes.target_branch
  const projectUrl = extractPathWithNamespace(event.project.web_url);
  console.log('$$Processing GitLab!! event:', { projectId, mrId, sourceBranch, targetBranch, projectUrl });
  const featureBranchSha = event.object_attributes.last_commit.id;
  const mainBranchSha = await getMainBranchLatestCommitSHA(projectId, gitlabToken);

  console.log('featureBranchSha:', featureBranchSha);
  console.log('mainBranchSha:', mainBranchSha);

  
  try {
    // Step 1: Fetch the diffs files in the MR
    const diffsResponse = await axios.get(`${env.GITLAB_API_BASE_URL}/projects/${projectId}/merge_requests/${mrId}/diffs`, {
      headers: { 'Private-Token': gitlabToken },
    });
    logger.info('$$Diffs fetched successfully:', diffsResponse)
    const diffs = diffsResponse.data;

    // Step 2: Fetch the original file content for each changed file
    const fileContents = await fetchAndDecodeFileContents(
      projectId, 
      diffs, 
      gitlabToken, 
      sourceBranch,
    )
    logger.info('$$File contents fetched successfully:', fileContents)

    // Step 3: Call the Greptile API to comments (individual comment and overall comment)
    const comments: Comment[] = await fetchGreptileComments(
      fileContents, 
      diffs, 
      gitlabToken, 
      env.GREPTILE_API_KEY,
      "main",
      projectUrl
    )
    console.log('Comments generated successfully:$$', comments)

    // const overallComment: string = await fetchGreptileOverallComment(
    //   fileContents, 
    //   diffs, 
    //   gitlabToken, 
    //   env.GREPTILE_API_KEY,
    //   "main",
    //   projectUrl
    // )
    // console.log('overallComment generated successfully:$$', overallComment)


    // Step 4: Post the generated comments to the MR
    // await postGitLabComments(projectId, mrId, comments, gitlabToken);
    await postMultipleComments(
      projectId, 
      mrId, 
      gitlabToken,
      diffs, 
      comments, 
      mainBranchSha, 
      featureBranchSha
    );

    // await postGitLabComments(projectId, mrId, overallComment, gitlabToken);

    logger.info('Comments posted to MR successfully');
  } catch (error) {
    console.error('Error processing GitLab event:', error);
  }
};