import type { MetroConfig } from 'metro-config'
import { serialize } from 'node:v8'
import { resolveClasslessComponents } from '../../../src/bundler/adapters/metro/classless-components'
import {
    CLASSLESS_COMPONENT_EXCLUSIONS,
    CLASSLESS_COMPONENT_NAMES,
    type ClasslessComponentName,
    DEFAULT_CLASSLESS_COMPONENT_NAMES,
    isDefaultClasslessComponent,
    NATIVE_COMPONENT_NAMES,
    NON_DEFAULT_CLASSLESS_COMPONENT_NAMES,
} from '../../../src/bundler/adapters/metro/constants'
import type {
    ClasslessComponentName as PublicClasslessComponentName,
    ClasslessComponentPredicate as PublicClasslessComponentPredicate,
} from '../../../src/bundler/adapters/metro/index.d'
import { withUniwindConfig } from '../../../src/bundler/adapters/metro/metro'
import type { ClasslessComponentPredicate, ExperimentalMetroOptions, UniwindMetroConfig } from '../../../src/bundler/types'

jest.mock('../../../src/bundler/adapters/metro/patches', () => ({
    cacheStore: {},
    patchMetroGraphToIncludeCssInLazyGraphs: () => {},
    patchMetroGraphToSupportUncachedModules: () => {},
}))

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

// The hand-written public declarations must match the internal ones.
const publicNamesMatchEligibleNames: Equal<PublicClasslessComponentName, ClasslessComponentName> = true
const publicPredicateMatchesInternalPredicate: Equal<PublicClasslessComponentPredicate, ClasslessComponentPredicate> = true

type OptimizeClasslessComponents = ExperimentalMetroOptions['optimizeClasslessComponents']

const exclusions = new Set<string>(CLASSLESS_COMPONENT_EXCLUSIONS)
const nonDefaults = new Set<string>(NON_DEFAULT_CLASSLESS_COMPONENT_NAMES)

// The eligible set and the default set are two separately adjustable concepts, so these assertions
// describe how each is derived rather than pinning one to the other.
describe('component sets', () => {
    test('keeps the public types in sync', () => {
        expect(publicNamesMatchEligibleNames).toBe(true)
        expect(publicPredicateMatchesInternalPredicate).toBe(true)
    })

    // Narrowing the eligible set must not touch `NATIVE_COMPONENT_NAMES`, which is also the resolver's
    // wrapper set, so the exclusions are their own list.
    test('derives the eligible set from the native components minus the exclusions', () => {
        expect([...CLASSLESS_COMPONENT_NAMES]).toEqual(
            NATIVE_COMPONENT_NAMES.filter(component => !exclusions.has(component)),
        )
    })

    test('derives the default set from the eligible components minus the non-default ones', () => {
        expect([...DEFAULT_CLASSLESS_COMPONENT_NAMES]).toEqual(
            CLASSLESS_COMPONENT_NAMES.filter(component => !nonDefaults.has(component)),
        )
    })

    test('reports default membership for every eligible component', () => {
        expect(CLASSLESS_COMPONENT_NAMES.filter(isDefaultClasslessComponent)).toEqual([...DEFAULT_CLASSLESS_COMPONENT_NAMES])
    })
})

describe('resolveClasslessComponents', () => {
    test.each([undefined, false])('enables nothing for %p', option => {
        expect(resolveClasslessComponents(option)).toEqual([])
    })

    test('enables the default set for true', () => {
        expect(resolveClasslessComponents(true)).toEqual([...DEFAULT_CLASSLESS_COMPONENT_NAMES])
    })

    test('treats true as a predicate that follows isDefault', () => {
        expect(resolveClasslessComponents((_component, { isDefault }) => isDefault)).toEqual(
            [...DEFAULT_CLASSLESS_COMPONENT_NAMES],
        )
    })

    test('asks the predicate once per eligible component, in a deterministic order', () => {
        const predicate = jest.fn((component: ClasslessComponentName) => component === 'View' || component === 'Image')

        expect(resolveClasslessComponents(predicate)).toEqual(['Image', 'View'])
        expect(predicate.mock.calls.map(([component]) => component)).toEqual([...CLASSLESS_COMPONENT_NAMES])
    })

    test('tells the predicate whether true would enable the component', () => {
        const seen: Array<[ClasslessComponentName, boolean]> = []

        resolveClasslessComponents((component, { isDefault }) => {
            seen.push([component, isDefault])

            return false
        })

        expect(seen).toEqual(
            CLASSLESS_COMPONENT_NAMES.map(component => [component, DEFAULT_CLASSLESS_COMPONENT_NAMES.includes(component)]),
        )
    })

    test('lets a predicate add the non-default components to the default set', () => {
        expect(resolveClasslessComponents((component, { isDefault }) => isDefault || nonDefaults.has(component))).toEqual(
            [...CLASSLESS_COMPONENT_NAMES],
        )
    })

    test('lets a predicate subtract a component from the default set', () => {
        expect(resolveClasslessComponents((component, { isDefault }) => isDefault && component !== 'View')).toEqual(
            DEFAULT_CLASSLESS_COMPONENT_NAMES.filter(component => component !== 'View'),
        )
    })

    test('enables every eligible component when the predicate accepts all of them', () => {
        expect(resolveClasslessComponents(() => true)).toEqual([...CLASSLESS_COMPONENT_NAMES])
    })

    test('never enables an excluded component', () => {
        expect(resolveClasslessComponents(() => true).filter(component => exclusions.has(component))).toEqual([])
    })

    test('enables nothing when the predicate rejects every component', () => {
        expect(resolveClasslessComponents(() => false)).toEqual([])
    })

    test('fails fast and names the component when the predicate throws', () => {
        const cause = new Error('boom')
        const predicate = jest.fn((component: ClasslessComponentName) => {
            if (component === 'Image') {
                throw cause
            }

            return true
        })

        let error: unknown
        try {
            resolveClasslessComponents(predicate)
        } catch (thrown) {
            error = thrown
        }

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe(
            'Uniwind: experimental.optimizeClasslessComponents threw for Image: boom',
        )
        expect((error as Error).cause).toBe(cause)
        expect(predicate.mock.lastCall?.[0]).toBe('Image')
    })

    test.each([
        [undefined, 'undefined'],
        [null, 'null'],
        [1, 'number'],
        ['true', 'string'],
        [{}, 'object'],
        [['View'], 'an array'],
    ])('fails fast and names the component when the predicate returns %p', (value, received) => {
        const predicate = (() => value) as unknown as OptimizeClasslessComponents

        expect(() => resolveClasslessComponents(predicate)).toThrow(
            `Uniwind: experimental.optimizeClasslessComponents must return a boolean for ActivityIndicator, received ${received}`,
        )
    })

    test('explains that the predicate must be synchronous when it returns a promise', () => {
        const predicate = (async (component: ClasslessComponentName) => component === 'View') as unknown as OptimizeClasslessComponents

        expect(() => resolveClasslessComponents(predicate)).toThrow(
            'Uniwind: experimental.optimizeClasslessComponents must return a boolean for ActivityIndicator, received a Promise; the predicate must be synchronous',
        )
    })

    test.each([
        [null, 'null'],
        [1, 'number'],
        ['View', 'string'],
        [{}, 'object'],
    ])('rejects %p as the option', (option, received) => {
        expect(() => resolveClasslessComponents(option as unknown as OptimizeClasslessComponents)).toThrow(
            `Uniwind: experimental.optimizeClasslessComponents must be a boolean or a function, received ${received}`,
        )
    })

    test('suggests a predicate when the option is a component list', () => {
        const option = ['View', 'Image'] as unknown as OptimizeClasslessComponents

        expect(() => resolveClasslessComponents(option)).toThrow(
            'Uniwind: experimental.optimizeClasslessComponents must be a boolean or a function, received an array; '
                + 'pass a predicate such as component => list.includes(component), with list typed as ClasslessComponentName[]',
        )
    })
})

describe('withUniwindConfig', () => {
    const getUniwindConfig = (experimental?: { optimizeClasslessComponents: OptimizeClasslessComponents }) => {
        const config = withUniwindConfig({} as MetroConfig, { cssEntryFile: './global.css', experimental })

        return (config.transformer as { uniwind: UniwindMetroConfig }).uniwind
    }

    test('serializes the resolved list instead of the predicate', () => {
        const uniwind = getUniwindConfig({ optimizeClasslessComponents: component => component === 'View' })

        expect(uniwind.optimizedClasslessComponents).toEqual(['View'])
        expect(uniwind.experimental).toEqual({})
        // Metro clones the transformer config into its workers (structured clone) and hashes it as JSON.
        expect(() => serialize(uniwind)).not.toThrow()
        expect(JSON.parse(JSON.stringify(uniwind))).toEqual(uniwind)
    })

    test.each([
        ['true', true, [...DEFAULT_CLASSLESS_COMPONENT_NAMES]],
        ['false', false, []],
        ['undefined', undefined, []],
    ])('serializes %s as a component list', (_, optimizeClasslessComponents, expected) => {
        expect(getUniwindConfig({ optimizeClasslessComponents }).optimizedClasslessComponents).toEqual(expected)
    })

    test('serializes a list even when no experimental options are given', () => {
        expect(getUniwindConfig().optimizedClasslessComponents).toEqual([])
    })
})
