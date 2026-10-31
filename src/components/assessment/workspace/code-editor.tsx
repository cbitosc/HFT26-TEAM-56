"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount } from "@monaco-editor/react";

// Monaco loads in the browser only (it needs the DOM and web workers).
const Editor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.default), {
  ssr: false,
  loading: () => <EditorPlaceholder />,
});

function EditorPlaceholder() {
  return <div className="h-full w-full animate-pulse bg-surface-1" aria-label="Loading editor" />;
}

/** Follows the app's light/dark theme (the `dark` class on <html>). */
function useDarkMode() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("vetted-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#16181e",
      "editorGutter.background": "#16181e",
      "editor.lineHighlightBackground": "#1c1f26",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#4b5160",
      "editorLineNumber.activeForeground": "#8d939e",
      "editor.selectionBackground": "#508cd540",
      "editorCursor.foreground": "#508cd5",
      "editorWidget.background": "#22252d",
      "editorIndentGuide.background1": "#ffffff0d",
    },
  });
  monaco.editor.defineTheme("vetted-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.lineHighlightBackground": "#f1f4f8",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#508cd533",
      "editorCursor.foreground": "#508cd5",
    },
  });
  // The sandbox runs plain scripts; type-level complaints (missing lib
  // types, unused exports) would only distract. Syntax errors still show.
  const ts = (monaco.languages as unknown as {
    typescript?: { typescriptDefaults?: { setDiagnosticsOptions(o: object): void }; javascriptDefaults?: { setDiagnosticsOptions(o: object): void } };
  }).typescript;
  ts?.typescriptDefaults?.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  ts?.javascriptDefaults?.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
};

export function CodeEditor({
  path,
  language,
  value,
  readOnly,
  onChange,
}: {
  /** Distinct per question, so each keeps its own model and undo history. */
  path: string;
  language: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const dark = useDarkMode();
  return (
    <Editor
      path={path}
      language={language}
      value={value}
      theme={dark ? "vetted-dark" : "vetted-light"}
      beforeMount={defineThemes}
      onChange={(next) => onChange(next ?? "")}
      loading={<EditorPlaceholder />}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        tabSize: language === "python" ? 4 : 2,
        insertSpaces: true,
        autoIndent: "full",
        formatOnPaste: false,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        padding: { top: 12, bottom: 12 },
        fixedOverflowWidgets: true,
        ariaLabel: "Code editor",
        tabFocusMode: false,
      }}
    />
  );
}
