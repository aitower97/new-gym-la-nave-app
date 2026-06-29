import os

files = [
    r'C:\Users\aitor.miranda.rocha\Documents\new-gym-la-nave-app\node_modules\react-native-screens\lib\module\core.js',
    r'C:\Users\aitor.miranda.rocha\Documents\new-gym-la-nave-app\node_modules\react-native-screens\lib\commonjs\core.js',
    r'C:\Users\aitor.miranda.rocha\Documents\new-gym-la-nave-app\node_modules\react-native-screens\lib\module\utils.js',
    r'C:\Users\aitor.miranda.rocha\Documents\new-gym-la-nave-app\node_modules\react-native-screens\lib\commonjs\utils.js',
]

core_old = "export const isNativePlatformSupported = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'windows';"
core_new = "export const isNativePlatformSupported = true; // patched for Expo Go New Arch"

utils_old = "export const isSearchBarAvailableForCurrentPlatform = ['ios', 'android'].includes(Platform.OS);"
utils_new = "export const isSearchBarAvailableForCurrentPlatform = true; // patched for Expo Go New Arch"

for fp in files:
    if not os.path.exists(fp):
        print('NOT FOUND:', fp)
        continue
    with open(fp, encoding='utf-8') as f:
        content = f.read()
    before = content
    content = content.replace(core_old, core_new)
    content = content.replace(utils_old, utils_new)
    if content != before:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print('PATCHED:', fp)
    else:
        print('NO MATCH (already patched or different content):', fp)

print('Done.')
