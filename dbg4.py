content = open('src/routes/profile.tsx', encoding='utf-8', newline='').read().replace('\r\n', '\n')

old = """          {insights.length === 0 && (
            <EmptyState text="No weekly insights yet. Insights are generated every Friday based on this week's chats." />
          )}
          {insights.map((insight) => {
              return (
                <div key={insight.id} className="rounded-xl border border-border bg-surface/60 p-5">"""

old = old.replace('\r\n', '\n')

idx = content.find('          {insights.length === 0 &&')
print('idx:', idx)
chunk = content[idx:idx+len(old)+20]
print('Match:', old in content)
print('OLD END:', repr(old[-60:]))
print('CHUNK END:', repr(chunk[len(old)-60:len(old)+5]))

for i, (a, b) in enumerate(zip(old, chunk)):
    if a != b:
        print(f'First diff at pos {i}: old={repr(a)} content={repr(b)}')
        print('old context:', repr(old[max(0,i-20):i+20]))
        print('content context:', repr(chunk[max(0,i-20):i+20]))
        break
else:
    print('All chars match up to min length')
