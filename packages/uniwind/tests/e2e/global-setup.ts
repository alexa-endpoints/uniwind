import Bun from 'bun'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, relative, resolve } from 'path'
import { Platform } from '../../src/common/consts'
import { compileWithArtifact } from '../compileWithArtifact'

// Playwright runs globalSetup with cwd = directory containing playwright.config.ts
// which is packages/uniwind/
const ROOT = resolve(process.cwd())

export const GENERATED_DIR = resolve(ROOT, 'tests/e2e/.generated')
export const CSS_PATH = resolve(GENERATED_DIR, 'uniwind.css')
// test.css compiled for a config that opts into the default font family.
export const DEFAULT_FONT_CSS_PATH = resolve(GENERATED_DIR, 'default-font.css')
// Entries that import Tailwind's parts without Preflight, compiled for that config: one declares
// Tailwind's layer order first, as `@import "tailwindcss"` does, and one leaves it out.
export const LAYER_ORDER_CSS_PATH = resolve(GENERATED_DIR, 'layer-order.css')
export const NO_LAYER_ORDER_CSS_PATH = resolve(GENERATED_DIR, 'no-layer-order.css')
export const BUNDLE_PATH = resolve(GENERATED_DIR, 'getWebStyles.iife.js')

// Compiles an entry for web, test.css unless the config names another.
const compileTestCSS = async (config: { cssEntryFile?: string; defaultFontFamily?: boolean }) =>
    (await compileWithArtifact({ cssEntryFile: 'tests/test.css', ...config }, Platform.Web)).code

const LAYER_ORDER = '@layer theme, base, components, utilities;'

const PARTS_ENTRIES = [
    { name: 'layer-order', cssPath: LAYER_ORDER_CSS_PATH, layerOrder: true },
    { name: 'no-layer-order', cssPath: NO_LAYER_ORDER_CSS_PATH, layerOrder: false },
]

// Writes an entry that imports Tailwind's theme and utilities without Preflight into its own
// directory, which Tailwind scans, and returns it relative to the working directory.
const writePartsEntry = (name: string, { layerOrder }: { layerOrder: boolean }) => {
    const entryPath = resolve(GENERATED_DIR, name, 'global.css')

    mkdirSync(dirname(entryPath), { recursive: true })
    writeFileSync(
        entryPath,
        [
            ...layerOrder ? [LAYER_ORDER] : [],
            '@import "tailwindcss/theme.css" layer(theme);',
            '@import "tailwindcss/utilities.css" layer(utilities);',
            '@import "uniwind";',
            '@source inline("font-mono");',
        ].join('\n'),
        'utf-8',
    )

    return relative(ROOT, entryPath)
}

export default async function globalSetup() {
    mkdirSync(GENERATED_DIR, { recursive: true })

    // 1. Compile test.css → real Tailwind CSS for web
    writeFileSync(CSS_PATH, await compileTestCSS({}), 'utf-8')
    console.log(`[e2e setup] Compiled CSS written to ${CSS_PATH}`)

    writeFileSync(DEFAULT_FONT_CSS_PATH, await compileTestCSS({ defaultFontFamily: true }), 'utf-8')
    console.log(`[e2e setup] Default font CSS written to ${DEFAULT_FONT_CSS_PATH}`)

    for (const { name, cssPath, layerOrder } of PARTS_ENTRIES) {
        const cssEntryFile = writePartsEntry(name, { layerOrder })

        writeFileSync(cssPath, await compileTestCSS({ cssEntryFile, defaultFontFamily: true }), 'utf-8')
        console.log(`[e2e setup] Default font CSS for ${cssEntryFile} written to ${cssPath}`)
    }

    // 2. Bundle getWebStyles.ts into a browser IIFE via Bun
    // The bundle exports getWebStyles and getWebVariable as globals on window.__uniwind
    const getWebStylesPath = resolve(ROOT, 'src/core/web/getWebStyles')
    const entryContent = [
        `import { getWebStyles, getWebVariable } from ${JSON.stringify(getWebStylesPath)}`,
        'window.__uniwind = { getWebStyles, getWebVariable }',
    ].join('\n')
    const entryPath = resolve(GENERATED_DIR, '_entry.ts')
    writeFileSync(entryPath, entryContent, 'utf-8')

    const bundle = await Bun.build({
        entrypoints: [entryPath],
        target: 'browser',
        format: 'iife',
        outdir: GENERATED_DIR,
        naming: {
            entry: 'getWebStyles.iife.js',
        },
        conditions: ['browser', 'import', 'default'],
    })

    if (!bundle.success) {
        throw new Error(bundle.logs.map(log => log.message).join('\n'))
    }

    console.log(`[e2e setup] Browser bundle written to ${BUNDLE_PATH}`)
}
