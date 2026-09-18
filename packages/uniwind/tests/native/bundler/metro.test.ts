import type { MetroConfig } from 'metro-config'
import type { CustomResolutionContext, CustomResolver, Resolution } from 'metro-resolver'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { withUniwindConfig } from '../../../src/bundler/adapters/metro/metro'

const mockMetroResolve = jest.fn<Resolution, Parameters<CustomResolver>>()

jest.mock('node:module', () => ({
    ...jest.requireActual('node:module'),
    createRequire: () => () => ({ resolve: mockMetroResolve }),
}))

jest.mock('../../../src/bundler/adapters/metro/patches', () => ({
    cacheStore: {},
    patchMetroGraphToIncludeCssInLazyGraphs: () => {},
    patchMetroGraphToSupportUncachedModules: () => {},
}))

const projectRoot = join('/', 'workspace', 'apps', 'pro-app')
const internalRoot = dirname(realpathSync(require.resolve('uniwind/package.json')))
const internalEntry = join(internalRoot, 'src', 'index.ts')
// A real package on disk, so the resolver can tell another installed uniwind copy apart from virtual modules.
const hoistedRoot = mkdtempSync(join(tmpdir(), 'uniwind-hoisted-'))
const hoistedEntry = join(hoistedRoot, 'node_modules', 'uniwind', 'src', 'index.ts')
const virtualEntry = join(projectRoot, 'node_modules', '.mf-metro', 'shared', 'uniwind.js')

const resolveUniwind = (configuredResolver: CustomResolver) => {
    const config = withUniwindConfig({
        projectRoot,
        resolver: { resolveRequest: configuredResolver },
    } as MetroConfig, { cssEntryFile: './global.css' })
    const context = {
        originModulePath: join(projectRoot, 'src', 'App.tsx'),
        resolveRequest: configuredResolver,
    } as CustomResolutionContext

    return config.resolver!.resolveRequest!(context, 'uniwind', 'ios')
}

beforeAll(() => {
    mkdirSync(dirname(hoistedEntry), { recursive: true })
    writeFileSync(join(hoistedRoot, 'node_modules', 'uniwind', 'package.json'), JSON.stringify({ name: 'uniwind' }))
    writeFileSync(hoistedEntry, '')
})

afterAll(() => {
    rmSync(hoistedRoot, { recursive: true, force: true })
})

beforeEach(() => {
    mockMetroResolve.mockReset()
})

test('resolves uniwind again with metro-resolver when the configured resolver picks another copy', () => {
    mockMetroResolve.mockReturnValue({ type: 'sourceFile', filePath: internalEntry })
    const configuredResolver = jest.fn<Resolution, Parameters<CustomResolver>>(() => ({ type: 'sourceFile', filePath: hoistedEntry }))

    const resolution = resolveUniwind(configuredResolver)

    // The importer's own resolution lands in another copy, so the request is pinned to the project and resolved again.
    expect(configuredResolver).toHaveBeenCalledTimes(2)
    expect(configuredResolver.mock.calls[0]![0].originModulePath).toBe(join(projectRoot, 'src', 'App.tsx'))
    expect(configuredResolver.mock.calls[1]![0].originModulePath).toBe(join(projectRoot, 'package.json'))
    expect(mockMetroResolve).toHaveBeenCalledTimes(1)

    const [context, moduleName, platform] = mockMetroResolve.mock.calls[0]!

    expect(context.originModulePath).toBe(join(projectRoot, 'package.json'))
    expect(context.resolveRequest).toBe(mockMetroResolve)
    expect(moduleName).toBe('uniwind')
    expect(platform).toBe('ios')
    expect(resolution).toEqual({ type: 'sourceFile', filePath: internalEntry })
})

test('keeps the configured resolution when it points to this uniwind copy', () => {
    const configuredResolver = jest.fn<Resolution, Parameters<CustomResolver>>(() => ({ type: 'sourceFile', filePath: internalEntry }))

    const resolution = resolveUniwind(configuredResolver)

    expect(mockMetroResolve).not.toHaveBeenCalled()
    expect(configuredResolver).toHaveBeenCalledTimes(1)
    expect(configuredResolver.mock.calls[0]![0].originModulePath).toBe(join(projectRoot, 'src', 'App.tsx'))
    expect(resolution).toEqual({ type: 'sourceFile', filePath: internalEntry })
})

test('keeps configured resolutions outside any uniwind package, such as federation shared modules', () => {
    const configuredResolver = jest.fn<Resolution, Parameters<CustomResolver>>(() => ({ type: 'sourceFile', filePath: virtualEntry }))

    const resolution = resolveUniwind(configuredResolver)

    expect(mockMetroResolve).not.toHaveBeenCalled()
    expect(configuredResolver).toHaveBeenCalledTimes(1)
    expect(configuredResolver.mock.calls[0]![0].originModulePath).toBe(join(projectRoot, 'src', 'App.tsx'))
    expect(resolution).toEqual({ type: 'sourceFile', filePath: virtualEntry })
})
