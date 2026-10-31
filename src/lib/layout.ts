// Resizable panels: the navigation sidebar and the AI assistant. Widths are
// CSS custom properties on <html>, so dragging never re-renders the panels'
// contents. The saved widths are applied by an inline script before first
// paint, like the theme.

export type PanelSize = {
  /** CSS custom property that holds the width. */
  cssVar: `--${string}`;
  storageKey: string;
  min: number;
  max: number;
  initial: number;
};

export const SIDEBAR_SIZE: PanelSize = {
  cssVar: "--sidebar-width",
  storageKey: "vetted:sidebar-width",
  min: 306,
  max: 400,
  initial: 320,
};

export const ASSISTANT_SIZE: PanelSize = {
  cssVar: "--assistant-width",
  storageKey: "vetted:assistant-width",
  min: 306,
  max: 400,
  initial: 340,
};

export function clampWidth(size: PanelSize, value: number) {
  return Math.round(Math.min(size.max, Math.max(size.min, value)));
}

export function readSavedWidth(size: PanelSize) {
  try {
    const saved = Number(window.localStorage.getItem(size.storageKey));
    return saved ? clampWidth(size, saved) : size.initial;
  } catch {
    return size.initial;
  }
}

export function applyWidth(size: PanelSize, width: number) {
  document.documentElement.style.setProperty(size.cssVar, `${width}px`);
}

export function saveWidth(size: PanelSize, width: number) {
  try {
    window.localStorage.setItem(size.storageKey, String(width));
  } catch {
    // Not persisted; the width still applies for this visit.
  }
}

/** Runs in <head>: restores saved panel widths before first paint. */
export const panelWidthScript = `(function(){try{var d=document.documentElement.style;${[SIDEBAR_SIZE, ASSISTANT_SIZE]
  .map(
    (size) =>
      `var v=Number(localStorage.getItem("${size.storageKey}"));if(v)d.setProperty("${size.cssVar}",Math.min(${size.max},Math.max(${size.min},Math.round(v)))+"px");`,
  )
  .join("")}}catch(e){}})()`;
