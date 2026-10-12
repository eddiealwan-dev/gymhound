// See scaled.js.
const real = require('react-native-web/dist/exports/useWindowDimensions').default;
const { SCALE } = require('./scaled');
module.exports = { __esModule: true, default: () => ({ ...real(), fontScale: SCALE }) };
