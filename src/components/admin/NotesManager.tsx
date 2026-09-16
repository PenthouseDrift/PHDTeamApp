"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { createNote, updateNote, deleteNote, type AdminNote } from "@/actions/admin/notes";

export function NotesManager({ initialNotes }: { initialNotes: AdminNote[] }) {
  const [notes, setNotes] = useState<AdminNote[]>(initialNotes);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNote | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(note: AdminNote) {
    setEditing(note);
    setEditorOpen(true);
  }

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  }

  function handleSaved(saved: AdminNote, isNew: boolean) {
    setNotes((prev) =>
      isNew ? [saved, ...prev] : prev.map((n) => (n.id === saved.id ? saved : n))
    );
    setEditorOpen(false);
    flash(isNew ? "Note added" : "Note updated");
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteNote(id);
      if (res.success) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
        flash("Note deleted");
      } else {
        flash(res.error || "Failed to delete");
      }
      setConfirmDeleteId(null);
    });
  }

  return (
    <div className="space-y-5">
      {/* Add button */}
      <button
        type="button"
        onClick={openNew}
        className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black text-base flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.99] border border-green-500/40"
      >
        <span className="text-xl">✚</span> Add Note
      </button>

      {feedback && (
        <p className="text-sm font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 p-2.5 rounded-lg border border-green-200 dark:border-green-800">
          {feedback}
        </p>
      )}

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-16 text-center">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No notes yet</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Click &quot;Add Note&quot; to create your first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notes.map((note) => (
            <article
              key={note.id}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 break-words">
                  {note.title}
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(note)}
                    title="Edit note"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(note.id)}
                    title="Delete note"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div
                className="note-html text-sm text-zinc-700 dark:text-zinc-300 break-words flex-1"
                dangerouslySetInnerHTML={{ __html: note.html }}
              />

              <p className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400">
                {note.authorName} · {new Date(note.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {note.updatedAt > note.createdAt ? " (edited)" : ""}
              </p>
            </article>
          ))}
        </div>
      )}

      {editorOpen && (
        <NoteEditorModal
          note={editing}
          onClose={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDelete(confirmDeleteId)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

function NoteEditorModal({
  note,
  onClose,
  onSaved,
}: {
  note: AdminNote | null;
  onClose: () => void;
  onSaved: (saved: AdminNote, isNew: boolean) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [html, setHtml] = useState(note?.html ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    const plain = html.replace(/<[^>]*>/g, "").trim();
    if (!plain) {
      setError("Note body is empty");
      return;
    }
    startTransition(async () => {
      if (note) {
        const res = await updateNote(note.id, title, html);
        if (res.success) {
          onSaved({ ...note, title: title.trim() || "Untitled", html, updatedAt: Date.now() }, false);
        } else {
          setError(res.error || "Failed to save");
        }
      } else {
        const res = await createNote(title, html);
        if (res.success) onSaved(res.data, true);
        else setError(res.error || "Failed to save");
      }
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-auto flex flex-col max-h-[85vh] max-h-[85dvh] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">
            {note ? "Edit Note" : "New Note"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
          {error && (
            <p className="text-sm font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </p>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <RichTextEditor value={html} onChange={setHtml} placeholder="Write your note..." />
        </div>

        <div className="shrink-0 flex gap-2 p-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={isPending}
            className="flex-1 py-2.5 text-sm font-black rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-md transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving..." : note ? "Save Changes" : "Add Note"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ConfirmDelete({
  onCancel,
  onConfirm,
  isPending,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-2xl text-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center text-2xl mx-auto">
          🗑️
        </div>
        <div>
          <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Delete note?</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">This can&apos;t be undone.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 py-2.5 text-sm font-black rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
          >
            {isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
