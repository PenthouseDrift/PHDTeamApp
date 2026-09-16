"use client";

import { useEffect, useRef } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

type ToolBtn = {
  label: string;
  title: string;
  command: string;
  value?: string;
};

const TOOLBAR: ToolBtn[] = [
  { label: "B", title: "Bold", command: "bold" },
  { label: "I", title: "Italic", command: "italic" },
  { label: "U", title: "Underline", command: "underline" },
  { label: "H", title: "Heading", command: "formatBlock", value: "H2" },
  { label: "•", title: "Bullet list", command: "insertUnorderedList" },
  { label: "1.", title: "Numbered list", command: "insertOrderedList" },
];

/**
 * A lightweight WYSIWYG editor built on contentEditable + document.execCommand.
 * No external dependencies — good enough for admin notes (bold/italic/underline,
 * headings, lists, links). Emits sanitized-on-server HTML via onChange.
 */
export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Initialise the editor content once (and when an external reset sets value
  // back to empty), without clobbering the caret while typing.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value && document.activeElement !== el) {
      el.innerHTML = value;
    }
  }, [value]);

  function exec(command: string, val?: string) {
    ref.current?.focus();
    // eslint-disable-next-line deprecation/deprecation
    document.execCommand(command, false, val);
    emit();
  }

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function addLink() {
    const url = window.prompt("Link URL (https://...)");
    if (!url) return;
    exec("createLink", url);
  }

  return (
    <div className="rounded-xl border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-800">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 px-2 py-1.5">
        {TOOLBAR.map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            onMouseDown={(e) => {
              e.preventDefault(); // keep selection
              exec(b.command, b.value);
            }}
            className="min-w-8 h-8 px-2 rounded-md text-sm font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            {b.command === "italic" ? <span className="italic">{b.label}</span> : b.label}
          </button>
        ))}
        <button
          type="button"
          title="Add link"
          onMouseDown={(e) => {
            e.preventDefault();
            addLink();
          }}
          className="min-w-8 h-8 px-2 rounded-md text-sm font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          🔗
        </button>
        <button
          type="button"
          title="Clear formatting"
          onMouseDown={(e) => {
            e.preventDefault();
            exec("removeFormat");
          }}
          className="min-w-8 h-8 px-2 rounded-md text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          ✕ Fmt
        </button>
      </div>

      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder || "Write your note..."}
        onInput={emit}
        onBlur={emit}
        className="rte-content min-h-[180px] max-h-[45vh] overflow-y-auto px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none leading-relaxed"
      />
    </div>
  );
}
