content = open('src/routes/profile.tsx', encoding='utf-8', newline='').read().replace('\r\n', '\n')

old = """          {insights.length === 0 && (
            <EmptyState text="No weekly insights yet. Insights are generated every Friday based on this week's chats." />
          )}
          {insights.map((insight) => {
              return (
                <div key={insight.id} className="rounded-xl border border-border bg-surface/60 p-5">"""

old = old.replace('\r\n', '\n')
print('old repr:', repr(old[:60]))
idx = content.find('{insights.length === 0 &&')
chunk = content[idx-10:idx+len(old)+10]
print('content repr:', repr(chunk[:60]))
print('Match:', old in content)
