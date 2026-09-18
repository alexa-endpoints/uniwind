import { FlatList, Text, View } from 'react-native'

const items = ['one', 'two']

export default function App() {
    return (
        <View testID="mf-uniwind-repro" className="flex-1 p-4">
            <FlatList
                data={items}
                contentContainerClassName="gap-2"
                renderItem={({ item }) => <Text className="text-lg font-bold">{item}</Text>}
            />
        </View>
    )
}
