import type { Insets } from 'react-native'
import { StyleDependency } from '../../common/consts'
import { UniwindListener } from '../listener'
import { Logger } from '../logger'
import { UniwindStore } from '../native'
import { createVarGetter } from '../native/native-utils'
import type { CSSVariables, GenerateStyleSheetsCallback, ThemeName, UniwindRuntimeOptions, Vars } from '../types'
import { UniwindConfigBuilder as UniwindConfigBuilderBase } from './config.common'

class UniwindConfigBuilder extends UniwindConfigBuilderBase {
    private stylesFingerprint: string | undefined

    constructor() {
        super()
    }

    updateCSSVariables(theme: ThemeName, variables: CSSVariables) {
        const runtimeVars = {} as Vars

        Object.entries(variables).forEach(([varName, varValue]) => {
            if (!varName.startsWith('--')) {
                if (__DEV__) {
                    Logger.error(`CSS variable name must start with "--", instead got: ${varName}`)
                }

                return
            }

            runtimeVars[varName] = createVarGetter(varValue)
        })

        UniwindStore.updateCSSVariables(theme, runtimeVars)
        UniwindListener.notify([StyleDependency.Variables])
    }

    updateInsets(insets: Insets) {
        UniwindStore.runtime.insets.bottom = insets.bottom ?? 0
        UniwindStore.runtime.insets.top = insets.top ?? 0
        UniwindStore.runtime.insets.left = insets.left ?? 0
        UniwindStore.runtime.insets.right = insets.right ?? 0
        UniwindListener.notify([StyleDependency.Insets])
    }

    protected __reinit(
        generateStyleSheetCallback: GenerateStyleSheetsCallback,
        themes: Array<string>,
        stylesFingerprint?: string,
        options?: UniwindRuntimeOptions,
    ) {
        UniwindStore.validateRemoteThemes(themes)

        // The fingerprint covers the runtime options too.
        if (__DEV__ && stylesFingerprint !== undefined && stylesFingerprint === this.stylesFingerprint) {
            return
        }

        // Apply the options first: the store notifies every subscriber, and those re-render with them.
        super.__reinit(generateStyleSheetCallback, themes, stylesFingerprint, options)
        UniwindStore.reinit(generateStyleSheetCallback, themes)
        this.stylesFingerprint = stylesFingerprint
    }

    protected __mergeStyles(id: string, generateStyleSheetCallback: GenerateStyleSheetsCallback, themes: Array<string>) {
        const dispose = UniwindStore.merge(id, generateStyleSheetCallback, themes)

        if (!UniwindStore.hasHostRegistration) {
            super.__reinit(generateStyleSheetCallback, themes)
        }

        return dispose
    }

    protected onThemeChange() {
        UniwindStore.runtime.currentThemeName = this.currentTheme
    }
}

export const Uniwind = new UniwindConfigBuilder()
