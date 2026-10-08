// React Native Web resets root text and inputs to `font: 14px System` inside
// @layer rnw. Uniwind's web Text and TextInput put this class on root text and
// inputs; @layer base sits above rnw and below utilities, so the page's
// --default-font-family beats the reset and font utilities still win. Because
// this rule reads the token, Tailwind emits it whenever the theme defines
// --font-sans, preflight or not. If the theme leaves the token unset, the rule
// falls back to React Native Web's System stack.
// The rule sits behind the `web:` variant's condition, which native compiles
// skip: native Text and TextInput read the token directly, so there the class
// would be a dead style that every federated remote registers again.
export const DEFAULT_FONT_CLASS_NAME = 'uniwind-default-font'

export const DEFAULT_FONT_CSS = `@layer base {
    @supports selector(div > div) {
        .${DEFAULT_FONT_CLASS_NAME} {
            font-family: var(--default-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
        }
    }
}
`
