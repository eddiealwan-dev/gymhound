/**
 * WEB DEV SERVER ONLY, and only when Expo starts with GH_TEXT_SCALE set (metro.config.js): Text and TextInput drawn at
 * one of iOS's larger text sizes, so a large-text layout can be looked at in a browser. iOS multiplies a font size and a
 * fixed line height by the text size's factor, capped by `maxFontSizeMultiplier`, and leaves text with
 * `allowFontScaling={false}` alone; this does the same. The largest sizes: 1.353 (Settings → Display & Brightness →
 * Text Size, at its end) and 3.571 (Accessibility → Larger Text, at its end). Never part of an iOS or Android bundle.
 */
const React = require('react');
const StyleSheet = require('react-native-web/dist/exports/StyleSheet').default;

const SCALE = Number(process.env.EXPO_PUBLIC_GH_TEXT_SCALE) || 1;

function scaled(Component, defaultSize) {
  const Scaled = React.forwardRef(function Scaled(props, ref) {
    const { allowFontScaling, maxFontSizeMultiplier } = props;
    if (allowFontScaling === false) return React.createElement(Component, { ...props, ref });
    const factor = maxFontSizeMultiplier != null && maxFontSizeMultiplier >= 1 ? Math.min(SCALE, maxFontSizeMultiplier) : SCALE;
    const flat = StyleSheet.flatten(props.style) || {};
    const style = { ...flat };
    // A Text with no size of its own inherits its parent's, already scaled.
    if (typeof flat.fontSize === 'number') style.fontSize = flat.fontSize * factor;
    else if (defaultSize) style.fontSize = defaultSize * factor;
    if (typeof flat.lineHeight === 'number') style.lineHeight = flat.lineHeight * factor;
    return React.createElement(Component, { ...props, style, ref });
  });
  Scaled.displayName = `Scaled(${Component.displayName || 'Text'})`;
  return Scaled;
}

module.exports = { scaled, SCALE };
