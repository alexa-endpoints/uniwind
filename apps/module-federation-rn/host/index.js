import { withAsyncStartup } from '@module-federation/metro/bootstrap'
import { AppRegistry } from 'react-native'

import { name as appName } from './app.json'

AppRegistry.registerComponent(
    appName,
    withAsyncStartup(
        () => require('./src/App'),
        () => require('./src/Fallback'),
    ),
)
