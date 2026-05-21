import 'react-native';

declare module 'react-native' {
  interface VirtualizedListProps<ItemT> {
    contentContainerStyle?: StyleProp<ViewStyle>;
    columnWrapperStyle?: StyleProp<ViewStyle>;
    refreshControl?: React.ReactElement;
  }
}
