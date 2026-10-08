import { Logger } from '@/bundler/logger'
import { compile } from '@tailwindcss/node'
import fs from 'fs'
import { transform } from 'lightningcss'
import path from 'path'

type ThemesVariables = Record<string, Set<string>>

const readFileSafe = (filePath: string) => {
    try {
        return fs.readFileSync(filePath, 'utf-8')
    } catch {
        return null
    }
}

const isExcludedDependency = (url: string) =>
    [
        url.includes('node_modules/tailwindcss'),
        url.includes('node_modules/@tailwindcss'),
        url.includes('node_modules/uniwind'),
    ].some(Boolean)

// An @import ends at its semicolon or, as the last statement, at EOF; it never runs into a block. Comments and strings
// are matched whole, so an @import inside one stays, and so do the quotes and semicolons inside them. Every part
// matches one way only, so text that turns out not to be an import is rejected in linear time.
const COMMENT = String.raw`/\*(?:[^*]|\*(?!/))*(?:\*/|$)`
const STRING = String.raw`"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'`
const IMPORT = String.raw`@import(?:[^;"'{/]|/(?!\*)|${COMMENT}|${STRING})*(?:;|$)`
const IMPORTS_FOR_ANALYSIS = new RegExp(`${COMMENT}|${STRING}|(${IMPORT})`, 'g')

const removeImportsForAnalysis = (css: string) =>
    css.replace(IMPORTS_FOR_ANALYSIS, (match, importRule?: string) => importRule === undefined ? match : '')

const hasThemesVariables = (themesVariables: ThemesVariables) => Object.values(themesVariables).some(variables => variables.size > 0)

const reportMissingThemesVariables = (themesVariables: ThemesVariables) => {
    let hasErrors = false as boolean

    Object.values(themesVariables).forEach(variables => {
        Object.entries(themesVariables).forEach(([checkedTheme, checkedVariables]) => {
            variables.forEach(variable => {
                if (!checkedVariables.has(variable)) {
                    Logger.error(`Theme ${checkedTheme} is missing variable ${variable}`)
                    hasErrors = true
                }
            })
        })
    })

    if (hasErrors) {
        Logger.error('All themes must have the same variables')
    }
}

const findThemesVariables = (themes: Array<string>, css: string, themesVariables: ThemesVariables) => {
    transform({
        // Tailwind owns import resolution, including prefix(...). Lightning
        // CSS only inspects import-free source for Uniwind theme metadata.
        code: Buffer.from(removeImportsForAnalysis(css)),
        filename: 'uniwind.css',
        visitor: {
            Rule: rule => {
                if (rule.type === 'unknown' && rule.value.name === 'variant') {
                    const [firstPrelude] = rule.value.prelude

                    if (
                        firstPrelude?.type !== 'token'
                        || firstPrelude.value.type !== 'ident'
                        || !themes.includes(firstPrelude.value.value)
                    ) {
                        return
                    }

                    const theme = firstPrelude.value.value

                    rule.value.block?.forEach(block => {
                        if (block.type === 'dashed-ident') {
                            themesVariables[theme]?.add(block.value)
                        }
                    })
                }
            },
        },
    })
}

// The theme variants the generated artifact declares.
const generateThemeVariantsCSS = (themes: Array<string>) =>
    themes.map(theme => {
        const notOtherThemes = themes.map(t => `.${t}, .${t} *`)

        if (theme === 'dark' || theme === 'light') {
            return [
                `@custom-variant ${theme} {`,
                `   &:where(.${theme}, .${theme} *) {`,
                '       @slot;',
                '   }',
                '',
                `   @media (prefers-color-scheme: ${theme}) {`,
                `       &:not(:where(${notOtherThemes.join(', ')})) {`,
                '           @slot;',
                '       }',
                '   }',
                '}',
                '',
            ].join('\n')
        }

        return `@custom-variant ${theme} (&:where(.${theme}, .${theme} *));`
    })

// The theme variables the generated artifact declares.
const generateThemeVariablesCSS = (themesVariables: ThemesVariables) =>
    hasThemesVariables(themesVariables)
        ? [
            '',
            '@theme {',
            ...Array.from(Object.values(themesVariables).at(0) ?? []).map(variable => `    ${variable}: unset;`),
            '}',
        ]
        : []

// The discovery compile imports the entry under this name, which it resolves to the entry's path: Tailwind's resolver
// would read a `?` or `#` in the entry's file name as a query or a fragment.
const DISCOVERY_ENTRY = 'uniwind:discovery-entry'

export const generateCSSForThemes = async (themes: Array<string>, input: string) => {
    // css generation
    const themesVariables: ThemesVariables = Object.fromEntries(themes.map(theme => [theme, new Set<string>()]))
    const inputPath = path.resolve(input)
    const cssPaths = new Set<string>()
    const scannedPaths = new Set<string>()
    const inputCSS = readFileSafe(inputPath)

    // Tailwind reports nested imports as it finishes reading their parents, in an order that varies between
    // runs. Scanning the stylesheets after the entry in path order keeps the generated artifact's bytes stable.
    const scanCSSPaths = () => {
        for (const cssPath of [inputPath, ...Array.from(cssPaths).sort()]) {
            const css = scannedPaths.has(cssPath) ? null : readFileSafe(cssPath)

            scannedPaths.add(cssPath)

            if (css !== null) {
                findThemesVariables(themes, css, themesVariables)
            }
        }
    }

    if (inputCSS !== null) {
        // Discovery compiles the entry to find the stylesheets Tailwind resolves. That compile also validates the
        // entry, while `@import "uniwind"` resolves to the current artifact, a fresh install's or another project's,
        // which may lack this build's theme variants (@variant) and theme variables (@apply, --theme()). So the
        // entry is compiled with the theme declarations this function generates, from the variables found so far:
        // the variants before it, so that the entry's own @custom-variant still wins, and the variables after it.
        // The entry is imported rather than inlined, so that its last statement, which may end at EOF without a
        // semicolon or inside an unclosed comment, ends with it. Tailwind resolves every @import before it
        // validates anything: when the compile fails after reaching stylesheets that declare theme variables, it
        // is retried with them. Any other error, such as an @import that doesn't resolve, fails artifact
        // generation instead of leaving theme variables out.
        const discoverCSSPaths = () =>
            compile(
                [
                    ...generateThemeVariantsCSS(themes),
                    `@import "${DISCOVERY_ENTRY}";`,
                    ...generateThemeVariablesCSS(themesVariables),
                ].join('\n'),
                {
                    base: path.dirname(inputPath),
                    customCssResolver: id => Promise.resolve(id === DISCOVERY_ENTRY ? inputPath : undefined),
                    onDependency: dependency => {
                        if (!isExcludedDependency(dependency)) {
                            cssPaths.add(dependency)
                        }
                    },
                },
            )

        await discoverCSSPaths().catch(async (error: unknown) => {
            // Lightning CSS can't scan every stylesheet Tailwind accepts. A failed compile still reports its own error.
            try {
                scanCSSPaths()
            } catch {
                throw error
            }

            if (!hasThemesVariables(themesVariables)) {
                throw error
            }

            await discoverCSSPaths().catch((retryError: unknown) => {
                // The retry declares the first theme's variables, so an entry that applies a variable only another
                // theme declares fails it too: report what the themes are missing, as the build always has.
                reportMissingThemesVariables(themesVariables)

                throw retryError
            })
        })
    }

    scanCSSPaths()
    reportMissingThemesVariables(themesVariables)

    return [...generateThemeVariantsCSS(themes), ...generateThemeVariablesCSS(themesVariables)].join('\n')
}
