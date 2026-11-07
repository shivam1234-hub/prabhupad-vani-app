import React, { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useDownload } from '../../contexts/DownloadContext';

// Height stays 60: MiniPlayer positions itself from this exact number.
const TAB_BAR_HEIGHT = 60;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { progress } = useDownload();
  const activeDownloads = Object.keys(progress).length;

  // Active tab gets a soft saffron pill behind its icon.
  const icon = (on: IconName, off: IconName) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <View style={[styles.iconPill, focused && styles.iconPillActive]}>
        <Ionicons name={focused ? on : off} size={20} color={color} />
      </View>
    );

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textDim,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: styles.tabIcon,
        tabBarItemStyle: styles.tabItem,
        tabBarBadgeStyle: styles.badge,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Library', tabBarIcon: icon('library', 'library-outline') }}
      />
      <Tabs.Screen
        name="browse"
        options={{ title: 'Search', tabBarIcon: icon('search', 'search-outline') }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Downloads',
          tabBarBadge: activeDownloads > 0 ? activeDownloads : undefined,
          tabBarIcon: icon('cloud-download', 'cloud-download-outline'),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: icon('time', 'time-outline') }}
      />
    </Tabs>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  tabBar: {
    backgroundColor: c.surface,
    borderTopColor: c.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: TAB_BAR_HEIGHT,
    paddingBottom: 3,
    paddingTop: 1,
    shadowColor: c.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: 14,
    marginTop: 0,
  },
  tabIcon: { marginTop: 0, marginBottom: 0 },
  // Each tab button already pads itself 5px and fixes the icon box at 28px,
  // so inside the fixed 60px bar any extra padding squeezes the label and
  // clips descenders (Library / History). Keep bar + item padding minimal.
  tabItem: { paddingVertical: 0 },
  iconPill: {
    width: 44,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: c.accent + '1f',
  },
  badge: {
    backgroundColor: c.accent,
    color: c.onAccent,
    fontSize: 10,
    fontWeight: '800',
  },
});
