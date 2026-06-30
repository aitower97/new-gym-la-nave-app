import os
root = r'C:\Users\aitor.miranda.rocha\Documents\new-gym-la-nave-app\node_modules'
results = []
for dirpath, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    depth = dirpath.replace(root, '').count(os.sep)
    if depth > 3:
        dirs[:] = []
        continue
    pkg = dirpath.replace(root + os.sep, '').split(os.sep)[0]
    if pkg == 'react-native':
        continue
    for f in files:
        if not f.endswith('.js'):
            continue
        fp = os.path.join(dirpath, f)
        try:
            with open(fp, encoding='utf-8', errors='ignore') as fh:
                content = fh.read()
            # Look for Platform from react-native imported at top level
            if "from 'react-native'" in content and 'Platform' in content:
                # Check if Platform is used at module level (not inside function)
                lines = content.split('\n')
                for i, line in enumerate(lines[:50]):
                    if 'Platform' in line and 'import' not in line and 'require' not in line:
                        results.append(f"{fp.replace(root, '')} line {i+1}: {line.strip()}")
                        break
        except:
            pass
for r in results[:30]:
    print(r)
