import { lazy, Suspense, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

const RemoteApp = lazy(() => import('eagerRemote/App'))

export default function App() {
    const [loadRemote, setLoadRemote] = useState(false)

    return (
        <View testID="mf-uniwind-remote-host" className="flex-1 p-4">
            <Text className="text-lg font-bold">host-ready</Text>
            <Pressable accessibilityRole="button" onPress={() => setLoadRemote(true)}>
                <Text>load-remote</Text>
            </Pressable>
            {loadRemote && (
                <Suspense fallback={<Text>loading-remote</Text>}>
                    <RemoteApp />
                </Suspense>
            )}
        </View>
    )
}
