export interface ShareAccessSettings {
  view_lab_ids: string[];
  edit_lab_ids: string[];
  view_user_ids: string[];
  edit_user_ids: string[];
}

export const emptyShareAccess = (): ShareAccessSettings => ({ view_lab_ids: [], edit_lab_ids: [], view_user_ids: [], edit_user_ids: [] });
