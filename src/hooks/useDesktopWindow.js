import { useCallback, useEffect, useState } from 'react';

export function useDesktopWindow() {
  const bridge = window.pondDesktop;
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!bridge) return undefined;
    let active = true;
    const refresh = () => {
      bridge.getAppInfo().then((next) => { if (active) setInfo(next); })
        .catch(() => { if (active) setError('暂时无法读取窗口状态'); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [bridge]);

  const action = useCallback(async (name) => {
    if (!bridge) return null;
    setError('');
    try {
      const result = await bridge.windowAction(name);
      if (!['close', 'quit', 'minimize'].includes(name)) setInfo(await bridge.getAppInfo());
      return result;
    } catch {
      // Closing destroys the renderer before IPC can reply; it is not an error.
      if (!['close', 'quit'].includes(name)) setError('窗口操作未完成，请再试一次');
      return null;
    }
  }, [bridge]);
  return { enabled: !!bridge, info, error, action };
}
