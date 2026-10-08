import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { CSS_PATH, DEFAULT_FONT_CSS_PATH, LAYER_ORDER_CSS_PATH, NO_LAYER_ORDER_CSS_PATH } from './global-setup'

const compiledCSS = readFileSync(DEFAULT_FONT_CSS_PATH, 'utf-8')

// The font stack React Native Web expands `System` to.
const RNW_SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// React Native Web declares @layer rnw before the app stylesheet, at runtime and
// in statically rendered HTML alike, and resets root text to `font: 14px System`
// there. Georgia stands in for the app's own --default-font-family. The page font
// is serif, so text that only inherits it can't pass for the System stack.
test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <!DOCTYPE html>
        <html class="light">
        <head>
            <style>@layer rnw { .rnw-text-reset { font: 14px Courier; } }</style>
            <style>${compiledCSS}</style>
            <style>html { font-family: serif; } #themed { --default-font-family: Georgia; }</style>
        </head>
        <body>
            <div id="page">Text</div>
            <div id="system" style='font-family: ${RNW_SYSTEM_FONT}'>Text</div>
            <div id="reset" class="rnw-text-reset">Text</div>
            <div id="themed" class="rnw-text-reset uniwind-default-font">Text</div>
            <div id="utility" class="rnw-text-reset uniwind-default-font font-mono" style="--default-font-family: Georgia">Text</div>
            <div id="no-token" class="rnw-text-reset uniwind-default-font" style="--default-font-family: initial">Text</div>
            <div id="root-default" class="rnw-text-reset uniwind-default-font">Text</div>
            <div style="display: contents; --font-sans: Georgia">
                <div id="scoped-font-sans" class="rnw-text-reset uniwind-default-font">Text</div>
            </div>
            <div style="display: contents; --default-font-family: Georgia">
                <div id="scoped-default-font" class="rnw-text-reset uniwind-default-font">Text</div>
            </div>
            <div class="font-mono" style="--default-font-family: Georgia">
                <input id="plain-input" class="rnw-text-reset">
                <input id="input" class="rnw-text-reset uniwind-default-font">
            </div>
        </body>
        </html>
    `)
})

const fontOf = (page: import('@playwright/test').Page, id: string) =>
    page.evaluate(id => getComputedStyle(document.getElementById(id)!).fontFamily, id)

test('root text takes the default font over the React Native Web reset', async ({ page }) => {
    expect(await fontOf(page, 'reset')).toBe('Courier')
    expect(await fontOf(page, 'themed')).toBe('Georgia')
})

test('font utilities still win over the default font', async ({ page }) => {
    expect(await fontOf(page, 'utility')).toMatch(/^ui-monospace,/)
})

test('without the token root text takes the React Native Web System stack, not the page font', async ({ page }) => {
    expect(await fontOf(page, 'page')).toBe('serif')
    expect(await fontOf(page, 'no-token')).toBe(await fontOf(page, 'system'))
})

// ScopedVariables and ScopedTheme put their overrides on a `display: contents` wrapper.
test('a scoped override reaches root text through --default-font-family, not --font-sans', async ({ page }) => {
    expect(await fontOf(page, 'root-default')).not.toBe('Georgia')
    expect(await fontOf(page, 'scoped-font-sans')).toBe(await fontOf(page, 'root-default'))
    expect(await fontOf(page, 'scoped-default-font')).toBe('Georgia')
})

test('Preflight lets inputs inherit their container font, and the class starts them from the default font instead', async ({ page }) => {
    expect(await fontOf(page, 'plain-input')).toMatch(/^ui-monospace,/)
    expect(await fontOf(page, 'input')).toBe('Georgia')
})

// Entries that import Tailwind's theme and utilities without Preflight.
test.describe('an entry that imports Tailwind\'s parts', () => {
    const open = (page: import('@playwright/test').Page, cssPath: string) =>
        page.setContent(`
            <!DOCTYPE html>
            <html class="light">
            <head>
                <style>@layer rnw { .rnw-text-reset { font: 14px Courier; } }</style>
                <style>${readFileSync(cssPath, 'utf-8')}</style>
            </head>
            <body>
                <div id="themed" class="rnw-text-reset uniwind-default-font" style="--default-font-family: Georgia">Text</div>
                <div id="utility" class="rnw-text-reset uniwind-default-font font-mono" style="--default-font-family: Georgia">Text</div>
            </body>
            </html>
        `)

    test('keeps font utilities above the default font when it declares Tailwind\'s layer order', async ({ page }) => {
        await open(page, LAYER_ORDER_CSS_PATH)

        expect(await fontOf(page, 'themed')).toBe('Georgia')
        expect(await fontOf(page, 'utility')).toMatch(/^ui-monospace,/)
    })

    test('lets the default font beat font utilities when it leaves the layer order out', async ({ page }) => {
        await open(page, NO_LAYER_ORDER_CSS_PATH)

        expect(await fontOf(page, 'themed')).toBe('Georgia')
        expect(await fontOf(page, 'utility')).toBe('Georgia')
    })
})

test('a config that leaves the option off ships no default font rule', () => {
    expect(readFileSync(CSS_PATH, 'utf-8')).not.toContain('uniwind-default-font')
    expect(compiledCSS).toContain('.uniwind-default-font')
})
