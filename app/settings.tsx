import React from 'react';
import { Redirect } from 'expo-router';
import { Desktop } from '../components/desktop';

/**
 * Settings page — desktop only (sidebar → Settings). Phones keep these
 * controls where they always were (Library, History, the player), so on a
 * phone this route just goes Home.
 */
export default function SettingsRoute() {
  return Desktop ? <Desktop.Settings /> : <Redirect href="/" />;
}
