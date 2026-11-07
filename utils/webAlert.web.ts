import { Alert, AlertButton } from 'react-native';

/**
 * Give `Alert.alert` a body on web.
 *
 * react-native-web ships Alert as `class Alert { static alert() {} }` — a
 * literal no-op. Every confirmation in the app goes through it (deleting a
 * download, clearing history, removing a lecture from the library), so on any
 * web-derived build those buttons look live and do nothing at all.
 *
 * Inside Electron this routes to a real Windows message box via the preload
 * bridge, so the dialogs look native and sit properly on top of the window. In
 * a plain browser it falls back to window.confirm/alert, which is ugly but
 * honest. Patching the module here rather than touching five call sites keeps
 * the shared screens identical across platforms.
 *
 * Called once from index.js, before expo-router boots.
 */

interface DesktopDialog {
  show: (opts: {
    title?: string;
    message?: string;
    buttons?: string[];
    defaultId?: number;
    cancelId?: number;
    destructive?: boolean;
  }) => Promise<number>;
}

function desktopDialog(): DesktopDialog | null {
  if (typeof window === 'undefined') return null;
  return (window as any).desktop?.dialog ?? null;
}

export function installWebAlert(): void {
  if (typeof window === 'undefined') return;

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    _options?: unknown,
  ): void => {
    const list: AlertButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    const labels = list.map((b, i) => b.text ?? (i === 0 ? 'OK' : 'Cancel'));

    const cancelIndex = list.findIndex(b => b.style === 'cancel');
    const destructiveIndex = list.findIndex(b => b.style === 'destructive');

    const press = (index: number) => {
      const button = list[index];
      // A dialog dismissed with Esc or the close button reports the cancel
      // index; running that button's onPress is what the native Alert does too.
      // Alert's type allows a prompt-style handler taking credentials, which
      // this app never uses — calling it with no argument is correct for every
      // button shape it actually passes.
      (button?.onPress as undefined | (() => void))?.();
    };

    const dialog = desktopDialog();
    if (dialog) {
      dialog
        .show({
          title,
          message,
          buttons: labels,
          // Put the keyboard default on the safe choice when one of the
          // options deletes something.
          defaultId: destructiveIndex >= 0 && cancelIndex >= 0 ? cancelIndex : 0,
          cancelId: cancelIndex >= 0 ? cancelIndex : labels.length - 1,
          destructive: destructiveIndex >= 0,
        })
        .then(press)
        .catch(() => {});
      return;
    }

    // Plain browser fallback.
    const text = [title, message].filter(Boolean).join('\n\n');
    if (list.length === 1) {
      window.alert(text);
      press(0);
      return;
    }

    const confirmIndex = list.findIndex(b => b.style !== 'cancel');
    const accepted = window.confirm(text);
    press(accepted ? (confirmIndex >= 0 ? confirmIndex : 0) : (cancelIndex >= 0 ? cancelIndex : 0));
  };
}
