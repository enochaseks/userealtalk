content = open('src/routes/profile.tsx', encoding='utf-8', newline='').read().replace('\r\n', '\n')

old = """          {insights.length === 0 && (
            <EmptyState text="No weekly insights yet. Insights are generated every Friday based on this week's chats." />
          )}
          {insights.map((insight) => {
              return (
                <div key={insight.id} className="rounded-xl border border-border bg-surface/60 p-5">"""

old = old.replace('\r\n', '\n')

idx = content.find('{insights.length === 0 &&')
chunk = content[idx-10:idx+len(old)+10]

print('OLD END:', repr(old[-80:]))
print('CONTENT END:', repr(chunk[10+len(old)-80:]))
print()
# compare char by char at the end
for i, (a, b) in enumerate(zip(old, chunk[10:])):
    if a != b:
        print(f'First diff at pos {i}: old={repr(a)} content={repr(b)}')
        print('old context:', repr(old[max(0,i-10):i+10]))
        print('content context:', repr(chunk[10+max(0,i-10):10+i+10]))
        break
else:
    if len(old) != len(chunk[10:len(old)+10]):
        print('Length differs')
    else:
        print('Identical!')
