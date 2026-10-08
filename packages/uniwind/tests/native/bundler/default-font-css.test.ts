import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { transform } from 'lightningcss'
import path from 'path'
import { buildCSS } from '../../../src/bundler/artifacts/css'
import { Platform } from '../../../src/common/consts'
import { compileWithArtifact } from '../../compileWithArtifact'

const RULE = '.uniwind-default-font {'

// The at-rules around each `.uniwind-default-font` rule, outermost first.
const enclosingRules = (css: string) => {
    const stack: Array<string> = []
    const found: Array<Array<string>> = []

    transform({
        code: Buffer.from(css),
        filename: 'uniwind.css',
        visitor: {
            Rule: rule => {
                if (rule.type === 'layer-block') {
                    stack.push(`@layer ${rule.value.name?.join('.')}`)
                }

                if (rule.type === 'supports') {
                    const { condition } = rule.value

                    stack.push(`@supports ${condition.type === 'selector' ? `selector(${condition.value})` : condition.type}`)
                }

                if (rule.type === 'style') {
                    const selector = rule.value.selectors.at(0)

                    if (selector?.length === 1 && selector[0]?.type === 'class' && selector[0].name === 'uniwind-default-font') {
                        found.push([...stack])
                    }
                }
            },
            RuleExit: rule => {
                if (rule.type === 'layer-block' || rule.type === 'supports') {
                    stack.pop()
                }
            },
        },
    })

    return found
}

const TOKEN = /--default-font-family:/g
const NATIVE_TOKEN = /"--default-font-family": vars =>/g

// An entry without Tailwind's preflight, the one stylesheet that reads the token on its own.
const NO_PREFLIGHT_ENTRY = [
    '@layer theme, base, components, utilities;',
    '@import "tailwindcss/theme.css" layer(theme);',
    '@import "tailwindcss/utilities.css" layer(utilities);',
    '@import "uniwind";',
    '@theme { --font-sans: Inter; }',
].join('\n')

let directory = ''

beforeAll(() => {
    directory = mkdtempSync(path.join(process.cwd(), '.tmp-default-font-css-'))
    mkdirSync(path.join(directory, 'no-preflight'))
    writeFileSync(path.join(directory, 'no-preflight', 'global.css'), NO_PREFLIGHT_ENTRY)
    // Tailwind scans the entry's directory, and a source that names the token would emit it too.
    writeFileSync(path.join(directory, 'no-preflight', 'App.tsx'), `export const className = 'p-4'`)
})

afterAll(() => {
    rmSync(directory, { force: true, recursive: true })
})

const noPreflightEntry = () => path.relative(process.cwd(), path.join(directory, 'no-preflight', 'global.css'))

describe('Default font CSS', () => {
    test('leaves the root text rule out of the default artifact', async () => {
        const artifactPath = path.join(directory, 'default.css')

        await buildCSS(['light', 'dark'], './tests/test.css', artifactPath)

        expect(readFileSync(artifactPath, 'utf-8')).not.toContain(RULE)
    })

    // The package stylesheet as git stores it, built from `@import "tailwindcss"; @import "uniwind";`. The test setup
    // rewrites the working copy before any test runs.
    test('commits the default artifact as the package stylesheet', async () => {
        const entryPath = path.join(directory, 'package-entry.css')
        const artifactPath = path.join(directory, 'package.css')

        writeFileSync(entryPath, ['@import "tailwindcss";', '@import "uniwind";'].join('\n'))
        await buildCSS(['light', 'dark'], entryPath, artifactPath)

        const committed = execFileSync('git', ['show', ':./uniwind.css'], { encoding: 'utf-8' })

        expect(committed).not.toContain(RULE)
        expect(committed).toBe(readFileSync(artifactPath, 'utf-8'))
    })

    test('ships the root text rule in the artifact of a config that opts in', async () => {
        const artifactPath = path.join(directory, 'opted-in.css')

        await buildCSS(['light', 'dark'], './tests/test.css', artifactPath, { defaultFontFamily: true })

        expect(readFileSync(artifactPath, 'utf-8')).toContain(RULE)
    })

    test.each([Platform.Web, Platform.iOS])('compiles no default font rule into %s CSS by default', async platform => {
        const { code } = await compileWithArtifact({ cssEntryFile: './tests/test.css' }, platform)

        expect(code).not.toContain('uniwind-default-font')
    })

    test.each([Platform.Web, Platform.iOS])('emits no --default-font-family for an entry without preflight by default (%s)', async platform => {
        const { code } = await compileWithArtifact({ cssEntryFile: noPreflightEntry() }, platform)

        expect(code).not.toMatch(TOKEN)
        expect(code).not.toMatch(NATIVE_TOKEN)
    })

    test('emits --default-font-family for an entry without preflight once the config opts in', async () => {
        const { code: web } = await compileWithArtifact({ cssEntryFile: noPreflightEntry(), defaultFontFamily: true }, Platform.Web)
        const { code: native } = await compileWithArtifact({ cssEntryFile: noPreflightEntry(), defaultFontFamily: true }, Platform.iOS)

        expect(web.match(TOKEN)).toHaveLength(1)
        expect(native.match(NATIVE_TOKEN)).toHaveLength(1)
    })

    test('compiles the rule into the base layer of web CSS, behind the web-only condition', async () => {
        const { code: css } = await compileWithArtifact({ cssEntryFile: './tests/test.css', defaultFontFamily: true }, Platform.Web)
        const rule = css.indexOf(RULE)

        expect(enclosingRules(css)).toEqual([['@layer base', '@supports selector(div > div)']])
        expect(css.slice(rule, css.indexOf('}', rule))).toContain('font-family: var(--default-font-family, -apple-system,')
    })

    test.each([Platform.iOS, Platform.Android])('keeps the web-only rule out of %s stylesheets', async platform => {
        const { code } = await compileWithArtifact({ cssEntryFile: './tests/test.css', defaultFontFamily: true }, platform)

        expect(code.match(/"uniwind-default-font"/g)).toBeNull()
        // Native Text and TextInput read the token itself.
        expect(code.match(NATIVE_TOKEN)).toHaveLength(1)
    })

    test('leaves the rule to the host in federated remote web CSS', async () => {
        const remoteCSSPath = path.join(directory, 'remote.css')

        writeFileSync(
            remoteCSSPath,
            [
                '@layer theme, base, components, utilities;',
                '@import "tailwindcss/theme.css" layer(theme) prefix(rmt);',
                '@import "tailwindcss/utilities.css" layer(utilities) prefix(rmt);',
                '@import "uniwind";',
                '@source inline("rmt:bg-red-500");',
            ].join('\n'),
        )

        const { code: host } = await compileWithArtifact(
            { cssEntryFile: './tests/test.css', defaultFontFamily: true, experimental: { federation: { role: 'host' } } },
            Platform.Web,
        )
        const { code: remote } = await compileWithArtifact(
            {
                cssEntryFile: path.relative(process.cwd(), remoteCSSPath),
                defaultFontFamily: true,
                experimental: { federation: { role: 'remote', id: 'remote-a' } },
            },
            Platform.Web,
        )

        expect(enclosingRules(host)).toEqual([['@layer base', '@supports selector(div > div)']])
        expect(enclosingRules(remote)).toEqual([])
        expect(remote).toContain('.rmt\\:bg-red-500')
    })
})
