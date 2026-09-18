import { FlatList, Text, View } from 'react-native'

const items = ['remote-one', 'remote-two']

export default function App() {
    return (
        <View testID="mf-uniwind-remote" className="p-4">
            <FlatList
                data={items}
                contentContainerClassName="gap-2"
                renderItem={({ item }) => <Text className="text-lg font-bold">{item}</Text>}
            />
        </View>
    )
}
