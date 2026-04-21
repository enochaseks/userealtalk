src = open('patch_insight.py', 'rb').read()
print('Script has CRLF:', b'\r\n' in src)
idx = src.find(b'old = """')
print(repr(src[idx:idx+120]))
