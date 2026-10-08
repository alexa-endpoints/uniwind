import Bun from 'bun'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { UniwindBundlerConfig } from '../../src/bundler/config'
import { compileCSS } from '../../src/bundler/css-compiler'
import { Platform } from '../../src/common/consts'

// Playwright runs globalSetup with cwd = directory containing playwright.config.ts
// which is packages/uniwind/
const ROOT = resolve(process.cwd())

export const GENERATED_DIR = resolve(ROOT, 'tests/e2e/.generated')
export const CSS_PATH = resolve(GENERATED_DIR, 'uniwind.css')
// test.css compiled for a config that opts into the default font family.
export const DEFAULT_FONT_CSS_PATH = resolve(GENERATED_DIR, 'default-font.css')
export const BUNDLE_PATH = resolve(GENERATED_DIR, 'getWebStyles.iife.js')

// Compiles test.css against the artifact its config generates, as the Metro transformer does, rather
// than against the package's shared uniwind.css that other suites rewrite.
const compileTestCSS = async (name: string, config: { defaultFontFamily?: boolean }) => {
    const bundlerConfig = UniwindBundlerConfig.fromMetroConfig({
        cssEntryFile: 'tests/test.css',
        dtsFile: resolve(GENERATED_DIR, 'uniwind-types.d.ts'),
        ...config,
    }, Platform.Web)
    const artifactPath = resolve(GENERATED_DIR, `${name}-artifact.css`)

    await bundlerConfig.generateArtifacts(artifactPath)

    return compileCSS(bundlerConfig, { artifactPath })
}

export default async function globalSetup() {
    mkdirSync(GENERATED_DIR, { recursive: true })

    // 1. Compile test.css → real Tailwind CSS for web
    writeFileSync(CSS_PATH, await compileTestCSS('uniwind', {}), 'utf-8')
    console.log(`[e2e setup] Compiled CSS written to ${CSS_PATH}`)

    writeFileSync(DEFAULT_FONT_CSS_PATH, await compileTestCSS('default-font', { defaultFontFamily: true }), 'utf-8')
    console.log(`[e2e setup] Default font CSS written to ${DEFAULT_FONT_CSS_PATH}`)

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
