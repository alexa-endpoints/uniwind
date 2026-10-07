import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import { buildCSS } from '../../../src/bundler/artifacts/css'
import { generateCSSForThemes } from '../../../src/bundler/artifacts/css/themes'
import { Logger } from '../../../src/bundler/logger'

const THEMES = ['light', 'dark', 'premium']
const THEME_VALUES: Record<string, string> = { light: 'white', dark: 'black', premium: 'gold' }
const THEME_SIZES: Record<string, string> = { light: '40rem', dark: '48rem', premium: '64rem' }

// Same shape as the example apps' entries: one variable per configured theme variant.
const themeBlock = (variable: string, themes = THEMES, values = THEME_VALUES) =>
    [
        '@layer theme {',
        '    :root {',
        ...themes.map(theme => `        @variant ${theme} { ${variable}: ${values[theme]}; }`),
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

    // An import after a rule must be the stylesheet's last statement, which needs no semicolon either.
    test.each([
        ['a string', '@import "./more.css"', ['--color-background', '--color-more']],
        // Tailwind leaves an import of a url to the browser.
        ['a url', '@import url(./more.css)', ['--color-background']],
    ])('accepts an entry ending, after a rule, with an import of %s that has no semicolon', async (_, statement, variables) => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'more.css'), themeBlock('--color-more'))
        writeEntry('', themeBlock('--color-background'), statement)

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(['@theme {', ...variables.map(variable => `    ${variable}: unset;`), '}'].join('\n'))
    })

    // Up to the apostrophe, the comment reads like more of the import. Finding that it isn't one must not take
    // longer the longer the comment is.
    test('accepts an entry ending with an import that has no semicolon and a comment with an apostrophe', async () => {
        await writeArtifact(['light', 'dark'])
        writeEntry('', themeBlock('--color-background'), '@import "./more.css"', '/* Left open on purpose, so don\'t close it */')
        writeFileSync(path.join(directory, 'more.css'), themeBlock('--color-more'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(['@theme {', '    --color-background: unset;', '    --color-more: unset;', '}'].join('\n'))
    })

    // Read as an import, the comment's mention would run to the next statement's semicolon and leave the comment open
    // over the theme variables.
    test('finds the theme variables after a comment that mentions an import', async () => {
        await writeArtifact(['light', 'dark'])
        writeEntry(
            '/* The @import "./fonts.css" of older entries moved to the app */',
            '@layer base, components;',
            themeBlock('--color-background'),
        )

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(themeVariable('--color-background'))
    })

    // A quoted `/*` read as the start of a comment, or an escaped quote read as the end of its string, would hide the
    // import after the value, and the scan would then fail on it as an import after a rule. Each quote style has its
    // own case, with a single escaped quote: if one ended the string early, a second would start it again, and it
    // would end where it should.
    test.each([
        ['a comment opener', '@source "./components/*.tsx";', '@import "./more.css";'],
        ['an escaped single quote', '.generated::before { content: \'/* Don\\\'t edit */\'; }', '@import \'./more.css\';'],
        ['an escaped double quote', '.generated::before { content: "/* A 12\\" screen */"; }', '@import "./more.css";'],
    ])('accepts an import after a quoted value with %s', async (_, statement, importStatement) => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'more.css'), themeBlock('--color-more'))
        writeEntry(statement, themeBlock('--color-background'), importStatement)

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(['@theme {', '    --color-background: unset;', '    --color-more: unset;', '}'].join('\n'))
    })

    // Tailwind also resolves an import nested in a block, whose end stands in for the import's semicolon. Read on past
    // that end, the import would run into the next block, up to the first semicolon inside it.
    test('finds the theme variables after a block that ends with an import without a semicolon', async () => {
        await writeArtifact(['light', 'dark'])
        writeFileSync(path.join(directory, 'nested.css'), themeBlock('--color-nested'))
        writeEntry('@layer base {', '    @import "./nested.css"', '}', themeBlock('--color-background'))

        const css = await generateCSSForThemes(THEMES, entryPath)

        expect(css).toContain(['@theme {', '    --color-background: unset;', '    --color-nested: unset;', '}'].join('\n'))
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

    // Tailwind stops at a stylesheet it can't parse or an import it can't resolve, so discovery never reaches the
    // stylesheets past it, which may declare what the themes would seem to be missing.
    test.each([
        ['an import it cannot resolve', {}, '@import "@/premium.css";', /resolve '@\/premium\.css'/],
        [
            'a nested stylesheet it cannot parse',
            { 'broken.css': ['@import "./premium.css";', '.card { color: red;'].join('\n') },
            '@import "./broken.css";',
            /Missing closing } at \.card/,
        ],
    ])('reports %s without calling the theme variables behind it missing', async (_, files, statement, message) => {
        const error = jest.spyOn(Logger, 'error').mockImplementation(() => {})

        try {
            await writeArtifact(['light', 'dark'])
            writeFileSync(path.join(directory, 'premium.css'), themeBlock('--color-background', ['premium']))
            Object.entries(files).forEach(([name, css]) => writeFileSync(path.join(directory, name), css))
            writeEntry(statement, themeBlock('--color-background', ['light', 'dark']))

            await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(message)
            expect(error).not.toHaveBeenCalled()
        } finally {
            error.mockRestore()
        }
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

    // The retry declares the first theme's variables, so applying one that only another theme declares still fails.
    test('reports the variables a theme is missing when the entry applies one of them', async () => {
        const error = jest.spyOn(Logger, 'error').mockImplementation(() => {})

        try {
            await writeArtifact(['light', 'dark'])
            writeEntry(
                '',
                themeBlock('--color-background'),
                '@layer theme { :root { @variant dark { --color-shadow: black; } } }',
                '.card { @apply bg-shadow; }',
            )

            await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(/Cannot apply unknown utility class `bg-shadow`/)
            expect(error.mock.calls.map(([message]) => message)).toEqual([
                'Theme light is missing variable --color-shadow',
                'Theme premium is missing variable --color-shadow',
                'All themes must have the same variables',
            ])
        } finally {
            error.mockRestore()
        }
    })

    // So does any other use of one: Tailwind builds variants such as breakpoints and container sizes from them, and
    // theme functions read them.
    test.each([
        [
            'applies a breakpoint variant built on one',
            [themeBlock('--breakpoint-tablet', ['dark'], THEME_SIZES)],
            '.card { @apply tablet:flex; }',
            /Cannot apply utility class `tablet:flex` because the `tablet` variant does not exist/,
            ['--breakpoint-tablet'],
        ],
        [
            'applies breakpoint and container variants built on them',
            [themeBlock('--breakpoint-tablet', ['dark'], THEME_SIZES), themeBlock('--container-tablet', ['dark'], THEME_SIZES)],
            '.card { @apply tablet:@tablet:flex; }',
            /because the `tablet` and `@tablet` variants do not exist/,
            ['--breakpoint-tablet', '--container-tablet'],
        ],
        [
            'nests a rule in a breakpoint variant built on one',
            [themeBlock('--breakpoint-tablet', ['dark'], THEME_SIZES)],
            '.card { @variant tablet { display: flex; } }',
            /Cannot use `@variant` with unknown variant: tablet/,
            ['--breakpoint-tablet'],
        ],
        [
            'nests a rule in a variant that reads one',
            [themeBlock('--breakpoint-tablet', ['dark'], THEME_SIZES)],
            '.card { @variant max-tablet { display: flex; } }',
            /Cannot use `@variant` with variant: max-tablet/,
            ['--breakpoint-tablet'],
        ],
        [
            'reads one with --theme()',
            [themeBlock('--color-shadow', ['dark'])],
            '.card { color: --theme(--color-shadow); }',
            /Could not resolve value for theme function/,
            ['--color-shadow'],
        ],
        [
            'reads one with theme()',
            [themeBlock('--color-shadow', ['dark'])],
            '.card { color: theme(--color-shadow); }',
            /Could not resolve value for theme function/,
            ['--color-shadow'],
        ],
        [
            'reads one with --spacing()',
            ['@theme { --spacing: initial; }', themeBlock('--spacing', ['dark'], THEME_SIZES)],
            '.card { padding: --spacing(4); }',
            /The --spacing\(…\) function requires that the `--spacing` theme variable exists/,
            ['--spacing'],
        ],
    ])('reports the variables a theme is missing when the entry %s', async (_, lines, rule, thrown, variables) => {
        const error = jest.spyOn(Logger, 'error').mockImplementation(() => {})

        try {
            await writeArtifact(['light', 'dark'])
            writeEntry('', themeBlock('--color-background'), ...lines, rule)

            await expect(generateCSSForThemes(THEMES, entryPath)).rejects.toThrow(thrown)
            expect(error.mock.calls.map(([message]) => message)).toEqual([
                ...['light', 'premium'].flatMap(theme => variables.map(variable => `Theme ${theme} is missing variable ${variable}`)),
                'All themes must have the same variables',
            ])
        } finally {
            error.mockRestore()
        }
    })
})
