import '@expo/metro-runtime'
import 'mf:init-host'
import { registerRootComponent } from 'expo'

import App from './src/App'

const bundleLoaderKey = 'uniwind_repro_remote_host__loadBundleAsync'
const loadBundleAsync = globalThis[bundleLoaderKey]
const loadProductionBundle = url => loadBundleAsync(url.replace('dev=true', 'dev=false'))

globalThis[bundleLoaderKey] = loadProductionBundle

registerRootComponent(App)
