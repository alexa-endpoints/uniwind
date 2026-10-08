import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import { buildCSS } from '../../../src/bundler/artifacts/css'
import { generateCSSForThemes } from '../../../src/bundler/artifacts/css/themes'

const THEMES = ['light', 'dark', 'premium']

// Same shape as the example apps' entries: one variable per configured theme variant.
const themeBlock = (variable: string) =>
    [
        '@layer theme {',
        '    :root {',
        `        @variant light { ${variable}: white; }`,
        `        @variant dark { ${variable}: black; }`,
        `        @variant premium { ${variable}: gold; }`,
        '    }',
        '}',
    ].join('\n')

// The generated `@theme` block that registers a theme variable.
const themeVariable = (variable: string) => ['@theme {', `    ${variable}: unset;`, '}'].join('\n')

describe('Theme artifact generation', () => {
    let directory = ''
    let entryPath = ''

    // Writes the artifact the way an earlier build left it. Built for the default themes from
    // an entry without theme variables, it is identical to the committed (fresh install) one.
    const writeArtifact = async (themes: Array<string>) => {
        const previousEntryPath = path.join(directory, 'previous.css')

        writeFileSync(previousEntryPath, '')
        await buildCSS(themes, previousEntryPath, path.join(directory, 'uniwind.css'))
    }

    // Same imports as the example apps' entries, except that the artifact is imported directly: inside this
    // package `@import "uniwind"` resolves to the workspace's own shared uniwind.css, not to this test's copy.
    const writeEntry = (...lines: Array<string>) =>
        writeFileSync(entryPath, ['@import "tailwindcss";', '@import "./uniwind.css";', ...lines].join('\n'))

    beforeEach(() => {
        directory = mkdtempSync(path.join(process.cwd(), '.tmp-theme-variants-'))
        entryPath = path.join(directory, 'global.css')
    })

    afterEach(() => {
        rmSync(directory, { force: true, recursive: true })
    })

    test('accepts an extra theme variant the generated artifact does not declare yet', async () => {
        await writeArtifact(['light', 'dark'])
        writeEntry('', themeBlock('--color-background'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain('@custom-variant premium (&:where(.premium, .premium *));')
        expect(css).toContain(themeVariable('--color-background'))
    })

    test('discovers theme variables in an imported stylesheet using an undeclared theme variant', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'themes.css'), themeBlock('--color-imported'))
        writeEntry('@import "./themes.css";')

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain('@custom-variant premium (&:where(.premium, .premium *));')
        expect(css).toContain(themeVariable('--color-imported'))
    })

    test('accepts theme variables used before the generated artifact declares them', async () => {
        await writeArtifact(['light', 'dark'])
        writeEntry(
            '',
            themeBlock('--color-background'),
            '@layer components {',
            '    .card { @apply bg-background; }',
            '    .label { color: --theme(--color-background); }',
            '}',
        )

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain('@custom-variant premium (&:where(.premium, .premium *));')
        expect(css).toContain(themeVariable('--color-background'))
    })

    test('discovers theme variables in an imported stylesheet when another import applies them', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'themes.css'), themeBlock('--color-imported'))
        writeFileSync(path.join(directory, 'card.css'), '.card { @apply bg-imported premium:bg-imported; }')
        writeEntry('@import "./themes.css";', '@import "./card.css";')

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(themeVariable('--color-imported'))
    })

    test('skips the JavaScript modules of local plugins and configs', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'colors.js'), 'module.exports = { brand: \'#ff0000\' }\n')
        writeFileSync(
            path.join(directory, 'tailwind.config.js'),
            'module.exports = { theme: { extend: { colors: require(\'./colors.js\') } } }\n',
        )
        writeFileSync(
            path.join(directory, 'plugin.js'),
            'module.exports = ({ addUtilities }) => addUtilities({ \'.brand\': { color: \'red\' } })\n',
        )
        writeEntry('@config "./tailwind.config.js";', '@plugin "./plugin.js";', themeBlock('--color-background'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(themeVariable('--color-background'))
    })

    // Tailwind also reports the files it finds in a local module's import and require strings, whatever their type.
    // Its import pattern ignores case and word boundaries, so a v3 config's `important: true` reads as an import.
    test('skips the other files that local plugins and configs appear to load', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'index.html'), '<!doctype html>\n<div id="root"></div>\n')
        writeFileSync(
            path.join(directory, 'tailwind.config.js'),
            'module.exports = { important: true, content: [\'./index.html\'] }\n',
        )
        writeEntry('@config "./tailwind.config.js";', themeBlock('--color-background'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(themeVariable('--color-background'))
    })

    test('ignores the themes of another project that last wrote the shared artifact', async () => {
        await writeArtifact(['light', 'dark', 'ocean'])
        writeEntry('', themeBlock('--color-background'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain('@custom-variant premium (&:where(.premium, .premium *));')
        expect(css).toContain(themeVariable('--color-background'))
        expect(css).not.toContain('ocean')
    })

    // In the real build the entry's own definition of a theme variant follows the artifact's, so it wins.
    test('keeps the entry\'s own definition of a theme variant', async () => {
        await writeArtifact(['light', 'dark'])
        writeEntry('@custom-variant dark (&:where(.dark, .dark *));', themeBlock('--color-background'), '.card { @apply not-dark:p-4; }')

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(themeVariable('--color-background'))
    })

    test('accepts an entry whose file name has characters a resolver reads as a query or a fragment', async () => {
        await writeArtifact(['light', 'dark'])
        entryPath = path.join(directory, 'global#?.css')
        writeEntry('', themeBlock('--color-background'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(themeVariable('--color-background'))
    })

    // A stylesheet's last statement may end at EOF without a semicolon or a newline. The theme
    // declarations discovery adds to the entry must not become part of it.
    test.each([
        ['an import', ['@import "tailwindcss";', '@import "./uniwind.css"']],
        ['a source directive', ['@import "tailwindcss";', '@import "./uniwind.css";', '@source "./src"']],
        [
            'a source directive after theme variables it applies',
            [
                '@import "tailwindcss";',
                '@import "./uniwind.css";',
                themeBlock('--color-background'),
                '.card { @apply bg-background premium:bg-background; }',
                '@source "./src"',
            ],
        ],
    ])('accepts an entry ending with %s that has no semicolon', async (_, lines) => {
        const entry = lines.join('\n')

        await writeArtifact(['light', 'dark'])
        writeFileSync(entryPath, `${entry};`)
        const expected = await generateCSSForThemes(THEMES, entryPath)

        writeFileSync(entryPath, entry)

        await expect(generateCSSForThemes(THEMES, entryPath)).resolves.toBe(expected)
    })

    // A comment still open at EOF ends with the stylesheet. The theme declarations must not become part of it.
    test.each([
        ['', []],
        [' after theme variables it applies', [themeBlock('--color-background'), '.card { @apply bg-background premium:bg-background; }']],
    ])('accepts an entry ending inside an unclosed comment%s', async (_, lines) => {
        await writeArtifact(['light', 'dark'])
        writeEntry(...lines)
        const expected = await generateCSSForThemes(THEMES, entryPath)

        writeEntry(...lines, '', '/* old overrides, disabled for now')

        await expect(generateCSSForThemes(THEMES, entryPath)).resolves.toBe(expected)
    })

    // Tailwind reports a nested import once it has read the stylesheet that imports it, so the imports of a large
    // stylesheet can come after those of a later one. The generated artifact must not depend on that order.
    test('declares theme variables in the same order however fast each stylesheet is read', async () => {
        await writeArtifact(['light', 'dark'])
        ;['first', 'second'].forEach((name, index) => {
            mkdirSync(path.join(directory, name))
            writeFileSync(
                path.join(directory, name, 'index.css'),
                [`/* ${'-'.repeat(index === 0 ? 1_000_000 : 0)} */`, '@import "./themes.css";'].join('\n'),
            )
            writeFileSync(path.join(directory, name, 'themes.css'), themeBlock(`--color-${name}`))
        })
        writeEntry('@import "./first/index.css";', '@import "./second/index.css";')

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(['@theme {', '    --color-first: unset;', '    --color-second: unset;', '}'].join('\n'))
    })

    test('declares the entry\'s theme variables before those of a stylesheet whose path sorts first', async () => {
        await writeArtifact(['light', 'dark'])
        mkdirSync(path.join(directory, 'a'))
        writeFileSync(path.join(directory, 'a', 'themes.css'), themeBlock('--color-imported'))
        writeEntry('@import "./a/themes.css";', themeBlock('--color-entry'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(['@theme {', '    --color-entry: unset;', '    --color-imported: unset;', '}'].join('\n'))
    })

    // Discovery resolves imports with Tailwind's own resolver, which doesn't know bundler aliases such as
    // Vite's `resolve.alias`. Generating an artifact without the theme variables behind them would be silent.
    test('reports a theme stylesheet import it cannot resolve', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'themes.css'), themeBlock('--color-imported'))
        writeEntry('@import "@/themes.css";')

        await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(/resolve '@\/themes\.css'/)
    })

    test('reports an import it cannot resolve rather than dropping the theme variables of other imports', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'themes.css'), themeBlock('--color-imported'))
        writeFileSync(path.join(directory, 'theme-index.css'), '@import "./themes.css";')
        writeEntry('@import "@/fonts.css";', '@import "./theme-index.css";')

        await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(/resolve '@\/fonts\.css'/)
    })

    // The theme variables found so far send discovery into its retry, which must still report the import:
    // the stylesheet behind it may declare more of them.
    test('reports an import it cannot resolve after retrying with the theme variables found so far', async () => {
        await writeArtifact(['light', 'dark'])
        writeEntry('@import "@/fonts.css";', themeBlock('--color-background'))

        await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(/resolve '@\/fonts\.css'/)
    })

    // Lightning CSS can't scan every stylesheet Tailwind accepts, such as one using theme() in a media query.
    test('reports an import it cannot resolve next to a stylesheet it cannot scan', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'layout.css'), '@media (width >= theme(--breakpoint-md)) { .wide { display: flex; } }')
        writeEntry('@import "./layout.css";', '@import "@/fonts.css";')

        await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(/resolve '@\/fonts\.css'/)
    })

    // Retrying with the theme variables found so far only covers the declarations this build generates.
    test.each([
        ['without theme variables', ['.card { @apply bg-missing; }']],
        ['after retrying with the theme variables', [themeBlock('--color-background'), '.card { @apply bg-background bg-missing; }']],
    ])('reports a utility class it cannot apply %s', async (_, lines) => {
        await writeArtifact(['light', 'dark'])
        writeEntry(...lines)

        await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(/Cannot apply unknown utility class `bg-missing`/)
    })
})
