
import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import 'react-native-reanimated';

import { ChitCircleProvider } from '@chitcircle/sdk/src/hooks';
import { mockClient } from '@chitcircle/sdk/src/mock';

import { useColorScheme } from '@/components/useColorScheme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  // Standard mock demo: Round 1 active,
  // with two members having already contributed.
  const client = useMemo(
    () => mockClient({ scenario: 'midRound' }),
    []
  );

  return (
    <ChitCircleProvider value={client}>
      <ThemeProvider
        value={
          colorScheme === 'dark'
            ? DarkTheme
            : DefaultTheme
        }
      >
        <Stack>
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="create"
            options={{ title: 'Create Circle' }}
          />
          <Stack.Screen
            name="join"
            options={{ title: 'Join Circle' }}
          />
          <Stack.Screen
            name="circle/[id]"
            options={{ title: 'Circle Details' }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal' }}
          />
        </Stack>
      </ThemeProvider>
    </ChitCircleProvider>
  );
}
