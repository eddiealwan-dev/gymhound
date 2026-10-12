// See scaled.js.
const Real = require('react-native-web/dist/exports/TextInput').default;
const Scaled = require('./scaled').scaled(Real, 14);
Scaled.State = Real.State;
module.exports = { __esModule: true, default: Scaled };
