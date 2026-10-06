import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { CSS_PATH } from './global-setup'

const compiledCSS = readFileSync(CSS_PATH, 'utf-8')

// React Native Web declares @layer rnw before the app stylesheet, at runtime and
// in statically rendered HTML alike, and resets root text to `font: 14px System`
// there. Georgia stands in for the app's own --default-font-family.
test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <!DOCTYPE html>
        <html class="light">
        <head>
            <style>@layer rnw { .rnw-text-reset { font: 14px Courier; } }</style>
            <style>${compiledCSS}</style>
            <style>#themed { --default-font-family: Georgia; }</style>
        </head>
        <body>
            <div id="reset" class="rnw-text-reset">Text</div>
            <div id="themed" class="rnw-text-reset uniwind-default-font">Text</div>
            <div id="utility" class="rnw-text-reset uniwind-default-font font-mono" style="--default-font-family: Georgia">Text</div>
            <div id="no-token" class="rnw-text-reset uniwind-default-font" style="--default-font-family: initial">Text</div>
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

test('without the token root text keeps the React Native Web reset font, not the browser default', async ({ page }) => {
    const font = await fontOf(page, 'no-token')

    expect(font).toMatch(/^-apple-system,/)
    expect(font).not.toBe('Courier')
})
