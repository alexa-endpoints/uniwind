import fs from 'node:fs'
import path from 'node:path'
import type * as Transformer from '../../../src/bundler/adapters/metro/transformer'
import type { UniwindMetroConfig } from '../../../src/bundler/types'

jest.mock('@tailwindcss/node', () => {
    const tailwind = jest.requireActual('@tailwindcss/node')

    return { ...tailwind, compile: jest.fn(tailwind.compile) }
})

jest.mock('metro-transform-worker', () => ({
    transform: async (_config: unknown, _projectRoot: string, _filePath: string, data: Buffer) => ({
        output: [{ data: { code: data.toString('utf8') } }],
    }),
}))

jest.mock('../../../src/bundler/adapters/metro/artifact-paths', () => require('./temporaryArtifactPaths'))

// The setup files already loaded the bundler with Tailwind's own compile, so load it again with the mock.
jest.resetModules()

const { transform } = require('../../../src/bundler/adapters/metro/transformer') as typeof Transformer
const { compile } = require('@tailwindcss/node') as { compile: jest.Mock }

const ENTRY = [
    '@import "tailwindcss";',
    '@import "uniwind";',
    '@layer theme { :root { @variant light { --color-brand: #ff0000; } @variant dark { --color-brand: #0000ff; } } }',
    '.card { @apply bg-brand; }',
].join('\n')

let directory = ''

beforeAll(() => {
    directory = fs.mkdtempSync(path.join(process.cwd(), '.tmp-discovery-artifact-'))
})

afterAll(() => {
    fs.rmSync(directory, { force: true, recursive: true })
})

const transformCSS = (uniwind: UniwindMetroConfig) =>
    transform(
        { uniwind } as unknown as Parameters<typeof transform>[0],
        process.cwd(),
        uniwind.cssEntryFile,
        Buffer.from(''),
        {
            customTransformOptions: {},
            dev: true,
            inlinePlatform: true,
            inlineRequires: false,
            minify: false,
            platform: 'android',
            type: 'module',
            unstable_transformProfile: 'default',
        },
    ).then(result => result.output[0]?.data.code as string)

// Every compile but the build's own, which compiles the entry's text.
const discoveryCompiles = () => compile.mock.calls.filter(([css]) => css !== ENTRY).length

describe('stylesheet discovery', () => {
    // Inside this package `@import "uniwind"` resolves to the workspace's shared uniwind.css, which never holds this
    // project's artifact, as when another project copied its own there last.
    test('compiles the entry once when the project\'s artifact is current, whatever the shared stylesheet holds', async () => {
        const cssPath = path.join(directory, 'global.css')
        const project: UniwindMetroConfig = {
            cssEntryFile: path.relative(process.cwd(), cssPath),
            dtsFile: path.join(directory, 'uniwind-types.d.ts'),
        }

        fs.writeFileSync(cssPath, ENTRY)
        fs.writeFileSync(path.join(directory, 'App.tsx'), `export const className = 'card'`)

        // The first build has no artifact yet, so it retries with the theme variables it found.
        await transformCSS(project)

        expect(fs.readFileSync('./uniwind.css', 'utf-8')).not.toContain('--color-brand')
        expect(discoveryCompiles()).toBe(2)

        for (let round = 0; round < 3; round++) {
            compile.mockClear()

            await expect(transformCSS(project)).resolves.toContain('"card"')
            expect(discoveryCompiles()).toBe(1)
        }
    })
})
