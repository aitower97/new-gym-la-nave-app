import os

files = {
    r'C:\Users\aitor.miranda.rocha\Documents\new-gym-la-nave-app\node_modules\react-native-screens\lib\commonjs\core.js': [
        (
            "const isNativePlatformSupported = exports.isNativePlatformSupported = _reactNative.Platform.OS === 'ios' || _reactNative.Platform.OS === 'android' || _reactNative.Platform.OS === 'windows';",
            "const isNativePlatformSupported = exports.isNativePlatformSupported = true; // patched for Expo Go New Arch"
        ),
    ],
    r'C:\Users\aitor.miranda.rocha\Documents\new-gym-la-nave-app\node_modules\react-native-screens\lib\commonjs\utils.js': [
        (
            "const isSearchBarAvailableForCurrentPlatform = exports.isSearchBarAvailableForCurrentPlatform = ['ios', 'android'].includes(_reactNative.Platform.OS);",
            "const isSearchBarAvailableForCurrentPlatform = exports.isSearchBarAvailableForCurrentPlatform = true; // patched for Expo Go New Arch"
        ),
    ],
}

for fp, replacements in files.items():
    if not os.path.exists(fp):
        print('NOT FOUND:', fp)
        continue
    with open(fp, encoding='utf-8') as f:
        content = f.read()
    before = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != before:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print('PATCHED:', fp)
    else:
        # Print relevant lines to understand the actual content
        for line in content.split('\n'):
            if 'isNativePlatform' in line or 'isSearchBar' in line:
                print('ACTUAL LINE:', line[:200])
        print('NO MATCH (printed actual lines above):', fp)

print('Done.')
