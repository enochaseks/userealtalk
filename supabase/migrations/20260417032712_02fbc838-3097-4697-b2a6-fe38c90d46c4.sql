-- Weekly insights tables
CREATE TABLE public.user_insight_settings (
  user_id UUID PRIMARY KEY,
  monitor_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_insight_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own insight settings select" ON public.user_insight_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insight settings insert" ON public.user_insight_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own insight settings update" ON public.user_insight_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insight settings delete" ON public.user_insight_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.conversation_weekly_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  week_start DATE NOT NULL,
  emotion_trend TEXT NOT NULL DEFAULT '',
  thought_patterns TEXT NOT NULL DEFAULT '',
  calm_progress TEXT NOT NULL DEFAULT '',
  overthinking_reduction TEXT NOT NULL DEFAULT '',
  ai_help_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id, week_start)
);

ALTER TABLE public.conversation_weekly_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own weekly insights select" ON public.conversation_weekly_insights
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own weekly insights insert" ON public.conversation_weekly_insights
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own weekly insights update" ON public.conversation_weekly_insights
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own weekly insights delete" ON public.conversation_weekly_insights
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_weekly_insights_user_week ON public.conversation_weekly_insights (user_id, week_start DESC);