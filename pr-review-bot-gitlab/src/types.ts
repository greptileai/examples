export type FileDiff = {
    old_path: string;
    new_path: string;
    a_mode: string;
    b_mode: string;
    diff: string;
    new_file: boolean;
    renamed_file: boolean;
    deleted_file: boolean;
    generated_file: boolean;
}
  
export type GitLabApiResponse = FileDiff[];
  
export type Source = {
  repository: string;
  remote: string;
  branch: string;
  filepath: string;
  linestart: number;
  lineend: number;
  summary: string;
}

export type GreptileQueryResponse = {
  message: string;
  sources: Source[];
}

export type Comment = {
  start?: number;
  end?: number;
  comment: string;
  modify_type?: "add" | "delete";
}

export type CommentPayload = {
  summary: string;
  comments: Comment[];
}

export type Position = {
  position_type: string;
  base_sha: string;
  head_sha: string;
  start_sha: string;
  new_path: string;
  old_path: string;
  new_line?: number;
  old_line?: number;
}

export type PostCommentProps = {
  projectId: string;
  mergeRequestId: number;
  accessToken: string;
  body: string;
  position: Position;
}
