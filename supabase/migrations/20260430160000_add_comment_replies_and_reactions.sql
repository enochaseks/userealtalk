-- Add reply threading to advice_comments
ALTER TABLE advice_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES advice_comments(id) ON DELETE CASCADE;

-- Comment reactions (simple toggle: one reaction per user per comment)
CREATE TABLE IF NOT EXISTS advice_comment_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES advice_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT advice_comment_reactions_comment_user_unique UNIQUE (comment_id, user_id)
);

ALTER TABLE advice_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advice_comment_reactions_select_all"
  ON advice_comment_reactions FOR SELECT USING (true);

CREATE POLICY "advice_comment_reactions_insert_own"
  ON advice_comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "advice_comment_reactions_delete_own"
  ON advice_comment_reactions FOR DELETE USING (auth.uid() = user_id);
