import re

content = open('src/routes/profile.tsx', encoding='utf-8', newline='').read()
# normalise to LF for matching, restore CRLF when writing
crlf = '\r\n' in content
content = content.replace('\r\n', '\n')

old = """          {insights.length === 0 && (
            <EmptyState text="No weekly insights yet. Insights are generated every Friday based on this week's chats." />
          )}
          {insights.map((insight) => {
              return (
                <div key={insight.id} className="rounded-xl border border-border bg-surface/60 p-5">"""

old = old.replace('\r\n', '\n')

new = """          {/* Early insight preview - Wednesdays only */}
          {insightMonitoringEnabled && (
            <div className="rounded-xl border border-border bg-surface/60 p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">Early insight preview</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {isWednesdayUtc()
                      ? alreadyGeneratedEarlyInsight
                        ? "Already generated this week"
                        : "Available every Wednesday \u2014 partial snapshot"
                      : "Available on Wednesdays only"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isWednesdayUtc() || alreadyGeneratedEarlyInsight || earlyInsightBusy}
                  onClick={generateEarlyInsight}
                  className="shrink-0"
                >
                  {earlyInsightBusy ? "Generating\u2026" : "Get early insight"}
                </Button>
              </div>
              {earlyInsight && (
                <div className="mt-4 space-y-3 text-sm border-t border-border/50 pt-4">
                  <div className="text-xs text-muted-foreground mb-2">
                    Partial snapshot \u2014 full breakdown arrives Friday
                  </div>
                  <InsightRow title="Emotion trend" value={String(earlyInsight.emotion_trend ?? "")} />
                  <InsightRow title="Thought patterns" value={String(earlyInsight.thought_patterns ?? "")} />
                  <InsightRow title="Calm progress" value={String(earlyInsight.calm_progress ?? "")} />
                </div>
              )}
            </div>
          )}

          {insights.length === 0 && (
            <EmptyState text="No weekly insights yet. Insights are generated every Friday based on this week's chats." />
          )}
          {insights.map((insight) => {
              return (
                <div key={insight.id} className="rounded-xl border border-border bg-surface/60 p-5">"""

if old in content:
    result = content.replace(old, new, 1)
    if crlf:
        result = result.replace('\n', '\r\n')
    open('src/routes/profile.tsx', 'w', encoding='utf-8', newline='').write(result)
    print('SUCCESS')
else:
    print('NOT FOUND')
    idx = content.find('No weekly insights yet')
    print('Index:', idx)
    print(repr(content[max(0, idx-120):idx+200]))
