import type { DesktopUI } from './types';
import Shell from './Shell';
import Home from './Home';
import Library from './Library';
import Search from './Search';
import Category from './Category';
import Lecture from './Lecture';
import Downloads from './Downloads';
import History from './History';
import ByLength from './ByLength';
import Settings from './Settings';

/**
 * The Windows desktop UI (Electron runs the Expo web export). Route files
 * render these instead of their phone screens when this is non-null.
 */
export const Desktop: DesktopUI | null = {
  Shell, Home, Library, Search, Category, Lecture, Downloads, History, ByLength, Settings,
};
