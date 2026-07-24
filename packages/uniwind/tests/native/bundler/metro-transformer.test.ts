import type { JsTransformerConfig, JsTransformOptions } from 'metro-transform-worker'
import { join, sep } from 'node:path'
import { transform } from '../../../src/bundler/adapters/metro/transformer'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { compileCSS } from '../../../src/bundler/css-compiler'
import type { UniwindMetroConfig } from '../../../src/bundler/types'

jest.mock('metro-transform-worker', () => ({
    transform: jest.fn((_config: unknown, _projectRoot: string, filename: string, data: Buffer) =>
        Promise.resolve({
            output: [{ data: { code: data.toString('utf-8'), filename } }],
        })
    ),
}))

jest.mock('../../../src/bundler/css-compiler', () => ({
    compileCSS: jest.fn(),
}))

const projectRoot = join(sep, 'workspace', 'apps', 'remote-a')
const workspaceRoot = join(sep, 'workspace')
const compileCSSMock = jest.mocked(compileCSS)
let artifactPath: string

type TransformResult = {
    output: Array<{ data: { code: string; filename: string } }>
}

const transformFile = async (filePath: string, uniwind: Partial<UniwindMetroConfig>, options: Partial<JsTransformOptions> = {}) => {
    const config = {
        uniwind: {
            cssEntryFile: './remote-a.css',
            isExpoProject: false,
            ...uniwind,
        },
    } as JsTransformerConfig & { uniwind: UniwindMetroConfig }

    const result: TransformResult = await transform(config, projectRoot, filePath, Buffer.from('@import "./tokens.css";'), {
        dev: true,
        platform: 'ios',
        type: 'module',
        ...options,
    } as JsTransformOptions)

    return result.output[0]!.data
}

const remote = { federation: { role: 'remote' as const, id: 'remoteA' } }

beforeEach(() => {
    jest.spyOn(process, 'cwd').mockReturnValue(projectRoot)
    jest.spyOn(UniwindBundlerConfig.prototype, 'generateArtifacts').mockImplementation(path => {
        artifactPath = path

        return Promise.resolve()
    })
    // The stylesheets Tailwind reports while it compiles the entry, in the order it reads them.
    compileCSSMock.mockImplementation((_bundlerConfig, onDependency) => {
        ;[
            join(projectRoot, 'tokens.css'),
            artifactPath,
            join(workspaceRoot, 'node_modules', 'tailwindcss', 'index.css'),
            join(projectRoot, 'themes', 'brand.css'),
            join(workspaceRoot, 'packages', 'design-tokens', 'colors.css'),
            join(projectRoot, 'tailwind.plugin.js'),
        ].forEach(dependency => onDependency?.(dependency))

        return Promise.resolve('({})')
    })
})

afterEach(() => {
    jest.restoreAllMocks()
    compileCSSMock.mockReset()
})

// Sorted by absolute path, relative to the entry.
const importedStylesheetRequires = [
    `require("./themes/brand.css");`,
    `require("./tokens.css");`,
    `require("../../packages/design-tokens/colors.css");`,
].join('')

const expectCodeToStartWith = (code: string, prefix: string) => expect(code.slice(0, prefix.length)).toBe(prefix)

describe('Metro transformer imported stylesheets', () => {
    test('federated remote entries require their local imported stylesheets during development', async () => {
        const { code, filename } = await transformFile('remote-a.css', remote)

        expect(filename).toBe('remote-a.css.js')
        expectCodeToStartWith(
            code,
            `${importedStylesheetRequires}const { Uniwind } = require('uniwind');const dispose = Uniwind.__mergeStyles("remoteA"`,
        )
        expect(code).toContain('if (module.hot) { module.hot.dispose(dispose); }')
    })

    test('host entries require the same stylesheets before reinitializing', async () => {
        const { code } = await transformFile('remote-a.css', {})

        expectCodeToStartWith(code, `${importedStylesheetRequires}const { Uniwind } = require('uniwind');Uniwind.__reinit(rt => ({})`)
    })

    test.each([['host', {}], ['federated remote', remote]])(
        '%s entries never require the generated artifact or packages under node_modules',
        async (_, uniwind) => {
            const { code } = await transformFile('remote-a.css', uniwind)

            expect(artifactPath.endsWith(`${sep}uniwind.css`)).toBe(true)
            expect(code).toContain('require("./tokens.css");')
            expect(code).not.toContain('uniwind.css')
            expect(code).not.toContain('node_modules')
            expect(code).not.toContain('tailwind.plugin.js')
        },
    )

    test('production entries require no imported stylesheets', async () => {
        const { code } = await transformFile('remote-a.css', remote, { dev: false })

        expectCodeToStartWith(code, `const { Uniwind } = require('uniwind');const dispose = Uniwind.__mergeStyles("remoteA"`)
    })

    test('imported native stylesheets are empty modules in plain Metro', async () => {
        const result = await transformFile('tokens.css', remote)

        expect(result).toEqual({ code: '', filename: 'tokens.css.js' })
        expect(compileCSSMock).not.toHaveBeenCalled()
    })
})
