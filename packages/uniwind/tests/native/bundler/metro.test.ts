import type { MetroConfig } from 'metro-config'
import type { CustomResolutionContext, CustomResolver, Resolution } from 'metro-resolver'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { serialize } from 'node:v8'
import {
    CLASSLESS_COMPONENT_NAMES,
    type ClasslessComponentName,
    RAW_COMPONENTS_MODULE,
} from '../../../src/bundler/adapters/metro/constants'
import { withUniwindConfig } from '../../../src/bundler/adapters/metro/metro'
import type { UniwindExperimentalConfig, UniwindMetroConfig } from '../../../src/bundler/types'

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

describe('raw-component module resolution', () => {
    const rawComponentsPath = join(internalRoot, 'src', 'bundler', 'adapters', 'metro', 'raw-components.ts')
    const fallbackResolution: Resolution = { type: 'empty' }

    const createConfig = (optimizeClasslessComponents: UniwindExperimentalConfig['optimizeClasslessComponents']) => {
        const configuredResolver = jest.fn<Resolution, Parameters<CustomResolver>>(() => fallbackResolution)
        const config = withUniwindConfig({
            projectRoot,
            resolver: { resolveRequest: configuredResolver },
        } as MetroConfig, {
            cssEntryFile: './global.css',
            experimental: { optimizeClasslessComponents },
        })
        const resolveRawComponents = () =>
            config.resolver!.resolveRequest!(
                {
                    originModulePath: join(projectRoot, 'src', 'App.tsx'),
                    resolveRequest: configuredResolver as CustomResolver,
                } as CustomResolutionContext,
                RAW_COMPONENTS_MODULE,
                'ios',
            )

        return { config, configuredResolver, resolveRawComponents }
    }

    test.each([
        ['true', true],
        ['a predicate that enables View', (component: ClasslessComponentName) => component === 'View'],
    ])('resolves the private module for %s', (_, option) => {
        const { configuredResolver, resolveRawComponents } = createConfig(option)

        expect(resolveRawComponents()).toEqual({ type: 'sourceFile', filePath: rawComponentsPath })
        expect(configuredResolver).not.toHaveBeenCalled()
    })

    test.each([
        ['undefined', undefined],
        ['false', false],
        ['a predicate that rejects every component', () => false],
    ])('leaves the request to the configured resolver for %s', (_, option) => {
        const { configuredResolver, resolveRawComponents } = createConfig(option)

        expect(resolveRawComponents()).toBe(fallbackResolution)
        expect(configuredResolver).toHaveBeenCalledTimes(1)
        expect(configuredResolver.mock.calls[0]![1]).toBe(RAW_COMPONENTS_MODULE)
    })

    test('asks the predicate once per eligible component and passes workers the resolved list', () => {
        const predicate = jest.fn((component: ClasslessComponentName) => component === 'View')
        const { config, resolveRawComponents } = createConfig(predicate)
        const uniwind = (config.transformer as { uniwind: UniwindMetroConfig }).uniwind

        resolveRawComponents()

        expect(predicate).toHaveBeenCalledTimes(CLASSLESS_COMPONENT_NAMES.length)
        expect(uniwind.optimizedClasslessComponents).toEqual(['View'])
        expect(uniwind.experimental).toEqual({})
        expect(() => serialize(config.transformer)).not.toThrow()
    })

    // Expo CLI's supervising worker hashes the transformer config but not Uniwind's transformer files.
    test('passes workers a fingerprint of the Uniwind transformers', () => {
        const fingerprints = [true, false, (component: ClasslessComponentName) => component === 'View'].map(option =>
            (createConfig(option).config.transformer as { uniwind: UniwindMetroConfig }).uniwind.transformerFingerprint
        )

        expect(fingerprints[0]).toMatch(/^[0-9a-f]{40}$/)
        expect(new Set(fingerprints).size).toBe(1)
    })

    test('fails while creating the config when the predicate throws', () => {
        expect(() =>
            createConfig(component => {
                if (component === 'Switch') {
                    throw new Error('boom')
                }

                return true
            })
        ).toThrow('Uniwind: experimental.optimizeClasslessComponents threw for Switch: boom')
    })
})
