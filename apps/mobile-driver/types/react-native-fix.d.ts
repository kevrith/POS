import 'react-native';

declare module 'react-native' {
  interface VirtualizedListProps<ItemT> {
    contentContainerStyle?: StyleProp<ViewStyle>;
    refreshControl?: React.ReactElement;
  }
}
