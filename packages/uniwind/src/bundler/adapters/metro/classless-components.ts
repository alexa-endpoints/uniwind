import type { ClasslessComponentPredicate, UniwindExperimentalConfig } from '@/bundler/types'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
    CLASSLESS_COMPONENT_NAME_SET,
    CLASSLESS_COMPONENT_NAMES,
    type ClasslessComponentName,
    type DefaultClasslessComponentsConfig,
    getDefaultClasslessComponentNames,
    isDefaultClasslessComponent,
} from './constants'

const OPTION_NAME = 'experimental.optimizeClasslessComponents'

const isPromiseLike = (value: unknown) => typeof value === 'object' && value !== null && typeof (value as PromiseLike<unknown>).then === 'function'

const describeValue = (value: unknown) => {
    if (value === null) {
        return 'null'
    }

    if (Array.isArray(value)) {
        return 'an array'
    }

    return isPromiseLike(value) ? 'a Promise' : typeof value
}

const isEnabled = (
    predicate: ClasslessComponentPredicate,
    component: ClasslessComponentName,
    config: DefaultClasslessComponentsConfig,
) => {
    let enabled: unknown

    try {
        enabled = predicate(component, { isDefault: isDefaultClasslessComponent(component, config) })
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)

        throw new Error(`Uniwind: ${OPTION_NAME} threw for ${component}: ${reason}`, { cause: error })
    }

    if (typeof enabled !== 'boolean') {
        const hint = isPromiseLike(enabled) ? '; the predicate must be synchronous' : ''

        throw new Error(`Uniwind: ${OPTION_NAME} must return a boolean for ${component}, received ${describeValue(enabled)}${hint}`)
    }

    return enabled
}

// Metro serializes `config.transformer` into its transform workers and hashes it into the transform
// cache key, so a predicate cannot reach the workers. It is evaluated once, in the process that
// creates the Metro config, into a deterministic list of component names. The default set depends on
// the resolved config, so `true` and `isDefault` follow its `defaultFontFamily`.
export const resolveClasslessComponents = (
    option: UniwindExperimentalConfig['optimizeClasslessComponents'],
    config: DefaultClasslessComponentsConfig,
): Array<ClasslessComponentName> => {
    if (option === undefined || option === false) {
        return []
    }

    if (option === true) {
        return [...getDefaultClasslessComponentNames(config)]
    }

    if (typeof option !== 'function') {
        const hint = Array.isArray(option)
            ? '; pass a predicate such as component => list.includes(component), with list typed as ClasslessComponentName[]'
            : ''

        throw new Error(`Uniwind: ${OPTION_NAME} must be a boolean or a function, received ${describeValue(option)}${hint}`)
    }

    return CLASSLESS_COMPONENT_NAMES.filter(component => isEnabled(option, component, config))
}

let rawComponentsPath: string | undefined

// Resolved through symlinks, like the active package root in metro.ts, so the file the resolver serves
// is the one the transformer recognizes.
export const getRawComponentsPath = () =>
    rawComponentsPath ??= join(
        dirname(realpathSync(require.resolve('uniwind/package.json'))),
        'src/bundler/adapters/metro/raw-components.ts',
    )

// The raw-component module re-exports only the enabled components, so a disabled one is never read
// through it (Fast Refresh reads every export of a module it registers).
export const getRawComponentsSource = (components: ReadonlyArray<string>) => {
    const exports = components.filter(component => CLASSLESS_COMPONENT_NAME_SET.has(component))

    return `export { ${exports.join(', ')} } from 'react-native'\n`
}
