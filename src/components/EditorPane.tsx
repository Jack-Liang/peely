import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

export interface EditorHandle {
  setValue(text: string): void;
  jumpTo(line: number, column: number): void;
  focus(): void;
}

interface Props {
  initial: string;
  onChange(text: string): void;
}

const setErrLine = StateEffect.define<number | null>();
const errMark = Decoration.line({ class: 'cm-error-line' });

const errLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrLine)) {
        if (e.value == null) {
          value = Decoration.none;
        } else {
          const ln = tr.state.doc.line(Math.max(1, Math.min(e.value, tr.state.doc.lines)));
          value = Decoration.set([errMark.range(ln.from)]);
        }
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** 左栏：可编辑的原始输入，带行号；支持跳转到错误行 */
export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane({ initial, onChange }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          errLineField,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.theme({
            '&': { height: '100%', backgroundColor: 'transparent' },
            '.cm-scroller': {
              fontFamily: 'var(--mono-font)',
              fontSize: '12.5px',
              lineHeight: '1.55',
            },
            '.cm-content': { caretColor: 'var(--accent)' },
            '.cm-gutters': {
              backgroundColor: 'var(--panel-bg)',
              color: 'var(--gutter-fg)',
              border: 'none',
              borderRight: '1px solid var(--border)',
            },
            '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
            '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
            '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' },
            '&.cm-focused': { outline: 'none' },
            '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
          }),
        ],
      }),
      parent: hostRef.current!,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    setValue(text) {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    jumpTo(line, column) {
      const view = viewRef.current;
      if (!view) return;
      const l = Math.max(1, Math.min(line, view.state.doc.lines));
      const ln = view.state.doc.line(l);
      const pos = Math.min(ln.from + Math.max(0, column - 1), ln.to);
      view.dispatch({
        selection: { anchor: pos },
        effects: [setErrLine.of(l), EditorView.scrollIntoView(pos, { y: 'center' })],
      });
      view.focus();
    },
    focus() {
      viewRef.current?.focus();
    },
  }));

  return <div className="editor-host" ref={hostRef} />;
});
