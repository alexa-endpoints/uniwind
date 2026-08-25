import { Dimensions, Platform } from 'react-native'
import { Orientation, Platform as UniwindPlatform, StyleDependency, UNIWIND_PLATFORM_VARIABLES, UNIWIND_THEME_VARIABLES } from '../../common/consts'
import { arrayEquals } from '../../common/utils'
import { UniwindListener } from '../listener'
import { Logger } from '../logger'
import type { ComponentState, GenerateStyleSheetsCallback, RNStyle, Style, StyleSheets, ThemeName, UniwindContextType, Var, Vars } from '../types'
import { createCascadeRanker } from './cascade'
import { getScopedVars } from './native-utils'
import {
    parseBoxShadow,
    parseFontVariant,
    parseFontVariationSettings,
    parseTextShadowMutation,
    parseTransformsMutation,
    resolveGradient,
} from './parsers'
import { UniwindRuntime } from './runtime'

type StylesResult = {
    styles: RNStyle
    dependencies: Array<StyleDependency>
    dependencySum: number
}

type StyleRegistration = {
    config: ReturnType<GenerateStyleSheetsCallback>
    owner: string
    themes: Array<string>
}

const emptyState: StylesResult = { styles: {}, dependencies: [], dependencySum: 0 }

export class UniwindStoreBuilder {
    runtime = UniwindRuntime
    vars = {} as Record<ThemeName, Vars>
    private stylesheet = {} as StyleSheets
    private cache = {} as Record<ThemeName, Map<string, StylesResult>>
    // Data attributes read by each class string with data variants, filled by resolveStyles
    private dataAttributeNames = new Map<string, Array<string>>()
    private baseRegistration: StyleRegistration | null = null
    private remoteRegistrations = new Map<string, StyleRegistration>()
    private runtimeVariableOverrides = {} as Record<ThemeName, Vars>
    private warnedClassConflicts = new Set<string>()
    private warnedVariableConflicts = new Set<string>()

    get hasHostRegistration() {
        return this.baseRegistration !== null
    }

    getStyles(
        className: string | undefined,
        componentProps: Record<string, any> | undefined,
        state: ComponentState | undefined,
        uniwindContext: UniwindContextType,
    ): StylesResult {
        if (className === undefined || className === '') {
            return emptyState
        }

        const isScopedTheme = uniwindContext.scopedTheme !== null
        const baseCacheKey = `${className}${state?.isDisabled ?? false}${state?.isFocused ?? false}${state?.isPressed ?? false}${isScopedTheme}${
            uniwindContext.rtl ?? ''
        }${uniwindContext.variables?.__uniwindVariablesCacheKey ?? ''}`
        const cache = this.cache[uniwindContext.scopedTheme ?? this.runtime.currentThemeName]

        if (!cache) {
            return emptyState
        }

        const cacheKey = baseCacheKey + this.getDataAttributesCacheKey(className, componentProps)

        if (cache.has(cacheKey)) {
            return cache.get(cacheKey)!
        }

        const result = this.resolveStyles(className, componentProps, state, uniwindContext)
        // The first resolve of a class string fills in its data attribute names, which changes its key
        const storeKey = baseCacheKey + this.getDataAttributesCacheKey(className, componentProps)

        cache.set(storeKey, result)
        UniwindListener.subscribe(
            () => cache.delete(storeKey),
            result.dependencies,
            { once: true },
        )

        return result
    }

    private getDataAttributesCacheKey(className: string, componentProps: Record<string, any> | undefined) {
        const names = this.dataAttributeNames.get(className)

        return names === undefined ? '' : JSON.stringify(names.map(name => componentProps?.[name] ?? null))
    }

    reinit = (generateStyleSheetCallback: GenerateStyleSheetsCallback, themes: Array<string>) => {
        this.validateRemoteThemes(themes)

        this.runtimeVariableOverrides = {}
        this.baseRegistration = {
            config: generateStyleSheetCallback(this.runtime),
            owner: 'host',
            themes,
        }
        this.rebuild()

        if (__DEV__ || this.remoteRegistrations.size > 0) {
            UniwindListener.notifyAll()
        }
    }

    validateRemoteThemes = (themes: Array<string>) => {
        for (const registration of this.remoteRegistrations.values()) {
            this.validateThemes(registration.owner, registration.themes, themes)
        }
    }

    updateCSSVariables = (theme: ThemeName, variables: Vars) => {
        this.runtimeVariableOverrides[theme] ??= {}
        Object.assign(this.runtimeVariableOverrides[theme], variables)
        this.vars[theme] ??= {}
        Object.assign(this.vars[theme], variables)
    }

    merge = (id: string, generateStyleSheetCallback: GenerateStyleSheetsCallback, themes: Array<string>) => {
        const registeredThemes = this.baseRegistration?.themes
            ?? this.remoteRegistrations.values().next().value?.themes

        if (registeredThemes) {
            this.validateThemes(id, themes, registeredThemes)
        }

        const registration = {
            config: generateStyleSheetCallback(this.runtime),
            owner: id,
            themes,
        }

        this.remoteRegistrations.set(id, registration)
        this.rebuild()
        UniwindListener.notify([StyleDependency.Stylesheet, StyleDependency.Variables])

        return () => {
            if (this.remoteRegistrations.get(id) !== registration) {
                return
            }

            this.remoteRegistrations.delete(id)
            this.rebuild()
            UniwindListener.notify([StyleDependency.Stylesheet, StyleDependency.Variables])
        }
    }

    private validateThemes(id: string, themes: Array<string>, expectedThemes: Array<string>) {
        if (!arrayEquals(themes, expectedThemes)) {
            throw new Error(`Uniwind: Federated styles '${id}' must use the host themes.`)
        }
    }

    private rebuild() {
        const registrations = [
            ...(this.baseRegistration ? [this.baseRegistration] : []),
            ...this.remoteRegistrations.values(),
        ]
        const themes = this.baseRegistration?.themes ?? registrations[0]?.themes ?? []
        const stylesheet = {} as StyleSheets
        const vars = {} as Vars
        const scopedVars = {} as Partial<Record<string, Vars>>
        const classNameOwners = new Map<string, string>()
        const variableOwners = new Map<PropertyKey, string>()
        // Each registration ranks its rules on its own; together they cascade as one stylesheet.
        const rankStyle = registrations.length > 1
            ? createCascadeRanker(registrations.map(registration => registration.config.cascade))
            : null

        for (const [registrationIndex, registration] of registrations.entries()) {
            for (const [className, styles] of Object.entries(registration.config.stylesheet)) {
                const existingOwner = classNameOwners.get(className)

                if (existingOwner !== undefined) {
                    const conflictKey = `${registration.owner}\0${className}`

                    if (__DEV__ && !this.warnedClassConflicts.has(conflictKey)) {
                        this.warnedClassConflicts.add(conflictKey)
                        Logger.warn(
                            `Federated class "${className}" from "${registration.owner}" was dropped because it is already registered by "${existingOwner}". Prefix remote class names to avoid conflicts.`,
                        )
                    }

                    continue
                }

                classNameOwners.set(className, registration.owner)
                stylesheet[className] = rankStyle ? styles.map(style => rankStyle(registrationIndex, style)) : styles
            }

            const registrationVariableNames = new Set<PropertyKey>([
                ...Reflect.ownKeys(registration.config.vars),
                ...Object.values(registration.config.scopedVars).flatMap(value => value ? Reflect.ownKeys(value) : []),
            ])
            const acceptedVariableNames = new Set<PropertyKey>()

            for (const variableName of registrationVariableNames) {
                const existingOwner = variableOwners.get(variableName)

                if (existingOwner !== undefined) {
                    const conflictKey = `${registration.owner}\0${String(variableName)}`

                    if (__DEV__ && !this.warnedVariableConflicts.has(conflictKey)) {
                        this.warnedVariableConflicts.add(conflictKey)
                        Logger.warn(
                            `Federated CSS variable "${
                                String(variableName)
                            }" from "${registration.owner}" was dropped because it is already registered by "${existingOwner}". Prefix remote CSS variables to avoid conflicts.`,
                        )
                    }

                    continue
                }

                variableOwners.set(variableName, registration.owner)
                acceptedVariableNames.add(variableName)
            }

            for (const variableName of acceptedVariableNames) {
                if (Object.hasOwn(registration.config.vars, variableName)) {
                    vars[variableName] = registration.config.vars[variableName]!
                }
            }

            for (const [scope, registrationVars] of Object.entries(registration.config.scopedVars)) {
                if (!registrationVars) {
                    continue
                }

                const targetVars = scopedVars[scope] ??= {}

                for (const variableName of acceptedVariableNames) {
                    if (Object.hasOwn(registrationVars, variableName)) {
                        targetVars[variableName] = registrationVars[variableName]!
                    }
                }
            }
        }

        const platform = this.getCurrentPlatform()
        const commonPlatform = platform.includes('tv') ? UniwindPlatform.TV : UniwindPlatform.Native
        const commonPlatformVars = scopedVars[`${UNIWIND_PLATFORM_VARIABLES}${commonPlatform}`]
        const platformVars = scopedVars[`${UNIWIND_PLATFORM_VARIABLES}${platform}`]

        if (commonPlatformVars) {
            Object.assign(vars, commonPlatformVars)
        }

        if (platformVars) {
            Object.assign(vars, platformVars)
        }

        this.stylesheet = stylesheet
        this.vars = Object.fromEntries(themes.map(theme => {
            const clonedVars = Object.create(vars) as Vars
            const themeVars = scopedVars[`${UNIWIND_THEME_VARIABLES}${theme}`]

            if (themeVars) {
                Object.assign(clonedVars, themeVars)
            }

            const runtimeVariableOverrides = this.runtimeVariableOverrides[theme]

            if (runtimeVariableOverrides) {
                Object.assign(clonedVars, runtimeVariableOverrides)
            }

            // Internal metadata inherits through scoped and inline variable overlays.
            clonedVars.__uniwindThemeName = theme

            return [theme, clonedVars]
        }))
        this.cache = Object.fromEntries(themes.map(theme => [theme, new Map()]))
        this.dataAttributeNames = new Map()
    }

    private resolveStyles(
        classNames: string,
        componentProps: Record<string, any> | undefined,
        state: ComponentState | undefined,
        uniwindContext: UniwindContextType,
    ) {
        const resultGetters = {} as Record<string, Var>
        const theme = uniwindContext.scopedTheme ?? this.runtime.currentThemeName
        // At this point we're sure that theme is correct
        const themeVars = this.vars[theme]!
        // Overlay scoped variables onto a prototype-chained clone so unset vars fall through to the theme
        let vars = uniwindContext.variables === null
            ? themeVars
            : Object.assign(
                Object.create(themeVars) as Vars,
                getScopedVars(uniwindContext.variables),
            )
        const originalVars = vars
        const dependencies = new Set<StyleDependency>([StyleDependency.Stylesheet])
        let dependencySum = 1 << StyleDependency.Stylesheet
        const bestRanks = new Map<string, number>()
        const isScopedTheme = uniwindContext.scopedTheme !== null
        let dataAttributeNames: Set<string> | null = null
        const classNameTokens = classNames.includes('\n')
            ? classNames.split(/\s+/).filter(Boolean)
            : classNames.split(' ')

        for (const className of classNameTokens) {
            if (!(className in this.stylesheet)) {
                continue
            }

            for (const style of this.stylesheet[className] as Array<Style>) {
                if (style.dependencies) {
                    style.dependencies.forEach(dep => {
                        if (dep === StyleDependency.Theme && isScopedTheme) {
                            return
                        }

                        dependencies.add(dep)
                        dependencySum |= 1 << dep
                    })
                }

                if (style.dataAttributeNames !== null) {
                    dataAttributeNames ??= new Set()
                    style.dataAttributeNames.forEach(name => dataAttributeNames!.add(name))
                }

                if (!style.matches(this.runtime, uniwindContext, componentProps, state, vars)) {
                    continue
                }

                for (const [property, valueGetter] of style.entries) {
                    const rank = style.importantProperties.includes(property) ? style.importantComplexity : style.complexity
                    const previousRank = bestRanks.get(property)

                    if (previousRank !== undefined && previousRank > rank) {
                        continue
                    }

                    if (property[0] === '-') {
                        // Clone vars object if we are adding inline variables
                        if (vars === originalVars) {
                            vars = Object.create(originalVars)
                        }

                        vars[property] = valueGetter
                    } else {
                        resultGetters[property] = valueGetter
                    }

                    bestRanks.set(property, rank)
                }
            }
        }

        const result = Object.fromEntries(
            Object.entries(resultGetters).map(([property, valueGetter]) => [property, valueGetter(vars)]),
        ) as Record<string, any>

        if (result.lineHeight !== undefined && result.lineHeight < 6) {
            result.lineHeight *= result.fontSize
        }

        if (result.boxShadow !== undefined) {
            result.boxShadow = parseBoxShadow(result.boxShadow)
        }

        if (result.visibility === 'hidden') {
            result.display = 'none'
        }

        if (
            result.borderStyle !== undefined && result.borderColor === undefined
        ) {
            result.borderColor = '#000000'
        }

        if (
            result.outlineStyle !== undefined && result.outlineColor === undefined
        ) {
            result.outlineColor = '#000000'
        }

        if (result.fontVariant !== undefined) {
            result.fontVariant = parseFontVariant(result.fontVariant)
        }

        if (typeof result.fontVariationSettings === 'string') {
            result.fontVariationSettings = parseFontVariationSettings(result.fontVariationSettings)
        }

        parseTransformsMutation(result)

        if (result.experimental_backgroundImage !== undefined) {
            result.experimental_backgroundImage = resolveGradient(result.experimental_backgroundImage)
        }

        if (result.textShadow !== undefined) {
            parseTextShadowMutation(result)
        }

        if (dataAttributeNames !== null) {
            this.dataAttributeNames.set(classNames, Array.from(dataAttributeNames))
        }

        return {
            styles: result,
            dependencies: Array.from(dependencies),
            dependencySum,
        }
    }

    private getCurrentPlatform() {
        const platform = Platform.OS

        if (platform === 'android') {
            return Platform.isTV ? UniwindPlatform.AndroidTV : UniwindPlatform.Android
        }

        if (platform === 'ios') {
            return Platform.isTV ? UniwindPlatform.AppleTV : UniwindPlatform.iOS
        }

        return platform
    }
}

export const UniwindStore = new UniwindStoreBuilder()

Dimensions.addEventListener('change', ({ window }: { window: ReturnType<typeof Dimensions.get> }) => {
    const newOrientation = window.width > window.height ? Orientation.Landscape : Orientation.Portrait
    const orientationChanged = UniwindStore.runtime.orientation !== newOrientation

    UniwindStore.runtime.screen = {
        width: window.width,
        height: window.height,
    }
    UniwindStore.runtime.orientation = newOrientation
    UniwindListener.notify([
        ...orientationChanged ? [StyleDependency.Orientation] : [],
        StyleDependency.Dimensions,
    ])
})
