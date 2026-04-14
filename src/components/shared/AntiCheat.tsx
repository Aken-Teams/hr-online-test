'use client';

import { useEffect } from 'react';

/**
 * Anti-cheat protections for exam pages.
 *
 * CSS: disables text selection, context menu long-press callout, and print.
 * JS:  blocks right-click, common keyboard shortcuts (copy, paste, print-screen,
 *      dev-tools), and flags when the user leaves the page.
 *
 * Note: these are deterrents, not foolproof — a determined user can bypass them.
 * The real enforcement is server-side (tab-switch limit + audit logs).
 */
export function AntiCheat({ blockNavigation = false }: { blockNavigation?: boolean }) {
  // --- Core anti-cheat: keyboard, clipboard, context menu ---
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + C (copy)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
      }
      // Ctrl/Cmd + V (paste) — block to prevent pasting answers from outside
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
      }
      // Ctrl/Cmd + A (select all)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
      }
      // Ctrl/Cmd + P (print)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
      }
      // Ctrl/Cmd + S (save page)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
      }
      // PrintScreen key — also attempt to overwrite clipboard
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        try {
          navigator.clipboard.writeText('').catch(() => {});
        } catch {
          // clipboard API may not be available
        }
      }
      // Win+Shift+S (Windows snipping tool) — can't fully block but detect
      if (e.shiftKey && e.metaKey && e.key === 'S') {
        e.preventDefault();
      }
      // F12 (dev tools)
      if (e.key === 'F12') {
        e.preventDefault();
      }
      // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (dev tools)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)
      ) {
        e.preventDefault();
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
    };
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
    };
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('dragstart', handleDragStart);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, []);

  // --- Blur content when page loses focus (deters alt-tab / tab-switch screenshots) ---
  useEffect(() => {
    const applyBlur = () => { document.body.style.filter = 'blur(10px)'; };
    const removeBlur = () => { document.body.style.filter = ''; };

    // Tab switch (e.g. Ctrl+Tab to another browser tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') applyBlur();
      else removeBlur();
    };

    // Window switch (e.g. Alt+Tab to another app)
    const handleBlur = () => applyBlur();
    const handleFocus = () => removeBlur();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.body.style.filter = '';
    };
  }, []);

  // --- Block back-navigation (browser back button) ---
  useEffect(() => {
    if (!blockNavigation) return;

    // Push a dummy state so the back button triggers popstate instead of leaving
    window.history.pushState({ examLock: true }, '');

    const handlePopState = () => {
      // Re-push to keep user on the page
      window.history.pushState({ examLock: true }, '');
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [blockNavigation]);

  return (
    <style jsx global>{`
      /* Disable text selection on the whole page during exam */
      body {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }

      /* Allow selection ONLY in textarea inputs (for typing answers) */
      textarea,
      input[type="text"],
      input[type="number"] {
        -webkit-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
        user-select: text;
      }

      /* Hide content when printing */
      @media print {
        body {
          display: none !important;
        }
      }
    `}</style>
  );
}
