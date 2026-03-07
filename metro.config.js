/**
 * Metro bundler configuration
 *
 * Metro is the JavaScript bundler used by React Native / Expo.
 * By default, it only knows how to handle common file types (js, ts, png, jpg, etc.).
 *
 * We need to tell it that .epub files are "assets" — files that should be
 * copied into the app bundle as-is, not parsed as code.
 * Without this, require('some-book.epub') would cause a build error.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .epub to the list of file extensions that Metro treats as assets
// (similar to how it already handles .png, .jpg, .mp3, etc.)
config.resolver.assetExts.push('epub');

// pdfjs-dist tries to require('canvas') for Node.js environments.
// In the browser we don't need it, so we tell Metro to resolve it to an empty module.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'canvas') {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
