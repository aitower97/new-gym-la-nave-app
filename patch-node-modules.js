const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, 'node_modules', 'react-native-screens', 'lib');

const patches = [
  {
    file: path.join(base, 'module', 'core.js'),
    replacements: [
      // Remove Platform from import so Platform.ios.js never loads at startup
      [
        "import { Platform, UIManager } from 'react-native';",
        "import { UIManager } from 'react-native';"
      ],
      [
        "export const isNativePlatformSupported = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'windows';",
        "export const isNativePlatformSupported = true; // patched: avoid top-level Platform.OS"
      ],
    ]
  },
  {
    file: path.join(base, 'module', 'utils.js'),
    replacements: [
      [
        "import { BackHandler, Platform } from 'react-native';",
        "import { BackHandler } from 'react-native';"
      ],
      [
        "export const isSearchBarAvailableForCurrentPlatform = ['ios', 'android'].includes(Platform.OS);",
        "export const isSearchBarAvailableForCurrentPlatform = true; // patched"
      ],
    ]
  },
  {
    file: path.join(base, 'commonjs', 'core.js'),
    replacements: [
      [
        "const isNativePlatformSupported = exports.isNativePlatformSupported = _reactNative.Platform.OS === 'ios' || _reactNative.Platform.OS === 'android' || _reactNative.Platform.OS === 'windows';",
        "const isNativePlatformSupported = exports.isNativePlatformSupported = true; // patched"
      ],
    ]
  },
  {
    file: path.join(base, 'commonjs', 'utils.js'),
    replacements: [
      [
        "const isSearchBarAvailableForCurrentPlatform = exports.isSearchBarAvailableForCurrentPlatform = ['ios', 'android'].includes(_reactNative.Platform.OS);",
        "const isSearchBarAvailableForCurrentPlatform = exports.isSearchBarAvailableForCurrentPlatform = true; // patched"
      ],
    ]
  },
];

let anyFailed = false;
patches.forEach(({ file, replacements }) => {
  if (!fs.existsSync(file)) {
    console.log('NOT FOUND:', file);
    return;
  }
  let content = fs.readFileSync(file, 'utf8');
  const before = content;
  replacements.forEach(([oldStr, newStr]) => {
    if (content.includes(oldStr)) {
      content = content.replace(oldStr, newStr);
    } else if (!content.includes(newStr)) {
      // Neither old nor new string found — unexpected
      console.warn('  WARNING: pattern not found in', path.basename(file), ':', oldStr.slice(0, 60));
      anyFailed = true;
    }
  });
  if (content !== before) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('PATCHED:', file.replace(base, 'lib'));
  } else {
    console.log('ALREADY PATCHED:', file.replace(base, 'lib'));
  }
});

if (anyFailed) {
  console.error('Some patches failed — check warnings above');
} else {
  console.log('All patches applied successfully.');
}
