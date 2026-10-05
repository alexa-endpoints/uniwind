// React Native Web resets root text and inputs to `font: 14px System` inside
// @layer rnw. Uniwind's web Text and TextInput put this class on root text and
// inputs; @layer base sits above rnw and below utilities, so the page's
// --default-font-family beats the reset and font utilities still win. Without
// the token it falls back to React Native Web's System stack.
export const DEFAULT_FONT_CSS = `@layer base {
    .uniwind-default-font {
        font-family: var(--default-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    }
}
`
