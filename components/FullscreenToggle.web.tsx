import React, { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Desktop: toggles real full screen (in Electron the whole window goes full
 * screen) for Presentation mode and Watch with slides. F11 does the same.
 */
export default function FullscreenToggle({ color = '#ccc', style }: { color?: string; style?: any }) {
  const [on, setOn] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setOn(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); toggle(); }
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      // Leaving the overlay also leaves full screen.
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <TouchableOpacity
      onPress={toggle}
      style={style}
      accessibilityLabel={on ? 'Exit full screen' : 'Full screen'}
      {...({ title: on ? 'Exit full screen (F11)' : 'Full screen (F11)' } as any)}
    >
      <Ionicons name={on ? 'contract-outline' : 'expand-outline'} size={22} color={color} />
    </TouchableOpacity>
  );
}
