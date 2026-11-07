/** Rich-text editor (TipTap) with a compact toolbar. */
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, Heading3, Italic, Link2, List, ListChecks, ListOrdered, Pilcrow, Quote, Redo2, Underline, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function useRichEditor({ content, onChange, placeholder }: { content: JSONContent | null; onChange: () => void; placeholder?: string }) {
  return useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
    ],
    content: content ?? '',
    editorProps: { attributes: { class: 'rte', 'aria-label': 'Discovery Call Book' } },
    onUpdate: onChange,
    immediatelyRender: true,
  })
}

function Tool({ on, active, label, children, disabled }: { on: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={cn('flex size-8 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground disabled:opacity-30 cursor-pointer [&_svg]:size-4', active && 'bg-muted text-foreground')}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      p: e.isActive('paragraph'),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()
  const sep = <span className="mx-1 h-5 w-px bg-border" />
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-card/95 px-2 py-1.5 backdrop-blur" role="toolbar" aria-label="Formatting">
      <Tool label="Undo" on={() => c().undo().run()} disabled={!s.undo}>
        <Undo2 />
      </Tool>
      <Tool label="Redo" on={() => c().redo().run()} disabled={!s.redo}>
        <Redo2 />
      </Tool>
      {sep}
      <Tool label="Section heading" active={s.h2} on={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </Tool>
      <Tool label="Sub-heading" active={s.h3} on={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </Tool>
      <Tool label="Paragraph" active={s.p && !s.bullet && !s.ordered && !s.task} on={() => c().setParagraph().run()}>
        <Pilcrow />
      </Tool>
      {sep}
      <Tool label="Bold" active={s.bold} on={() => c().toggleBold().run()}>
        <Bold />
      </Tool>
      <Tool label="Italic" active={s.italic} on={() => c().toggleItalic().run()}>
        <Italic />
      </Tool>
      <Tool label="Underline" active={s.underline} on={() => c().toggleUnderline().run()}>
        <Underline />
      </Tool>
      <Tool
        label="Link"
        active={s.link}
        on={() => {
          if (s.link) return c().unsetLink().run()
          const url = prompt('Link URL (https://…)')
          if (url && /^https?:\/\//i.test(url)) c().extendMarkRange('link').setLink({ href: url }).run()
        }}
      >
        <Link2 />
      </Tool>
      {sep}
      <Tool label="Bullet list" active={s.bullet} on={() => c().toggleBulletList().run()}>
        <List />
      </Tool>
      <Tool label="Numbered list" active={s.ordered} on={() => c().toggleOrderedList().run()}>
        <ListOrdered />
      </Tool>
      <Tool label="Checklist (e.g. fit check)" active={s.task} on={() => c().toggleTaskList().run()}>
        <ListChecks />
      </Tool>
      <Tool label="Quote" active={s.quote} on={() => c().toggleBlockquote().run()}>
        <Quote />
      </Tool>
    </div>
  )
}

export function RichTextEditor({ editor, className }: { editor: Editor | null; className?: string }) {
  if (!editor) return null
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="px-6 py-5 sm:px-8" />
    </div>
  )
}
