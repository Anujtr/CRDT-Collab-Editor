import React, { useCallback, useMemo, useState } from 'react';
import { 
  createEditor, 
  Descendant, 
  Editor, 
  Transforms, 
  Text, 
  Element as SlateElement 
} from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { cn } from '../../utils';

// Define custom types for Slate
type CustomElement = {
  type: 'paragraph' | 'heading-one' | 'heading-two' | 'block-quote' | 'bulleted-list' | 'numbered-list' | 'list-item';
  children: CustomText[];
  align?: 'left' | 'center' | 'right' | 'justify';
};

type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
};

declare module 'slate' {
  interface CustomTypes {
    Editor: ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

// Helper functions for formatting
const isMarkActive = (editor: Editor, format: keyof Omit<CustomText, 'text'>) => {
  const marks = Editor.marks(editor);
  return marks ? marks[format] === true : false;
};

const toggleMark = (editor: Editor, format: keyof Omit<CustomText, 'text'>) => {
  const isActive = isMarkActive(editor, format);

  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
};

const isBlockActive = (editor: Editor, format: CustomElement['type']) => {
  const { selection } = editor;
  if (!selection) return false;

  const [match] = Array.from(
    Editor.nodes(editor, {
      at: Editor.unhangRange(editor, selection),
      match: n =>
        !Editor.isEditor(n) &&
        SlateElement.isElement(n) &&
        n.type === format,
    })
  );

  return !!match;
};

const toggleBlock = (editor: Editor, format: CustomElement['type']) => {
  const isActive = isBlockActive(editor, format);
  const isList = ['numbered-list', 'bulleted-list'].includes(format);

  Transforms.unwrapNodes(editor, {
    match: n =>
      !Editor.isEditor(n) &&
      SlateElement.isElement(n) &&
      ['numbered-list', 'bulleted-list'].includes(n.type),
    split: true,
  });

  let newProperties: Partial<SlateElement>;
  if (isActive) {
    newProperties = {
      type: 'paragraph',
    };
  } else if (isList) {
    newProperties = {
      type: 'list-item',
    };
  } else {
    newProperties = {
      type: format,
    };
  }

  Transforms.setNodes<SlateElement>(editor, newProperties);

  if (!isActive && isList) {
    const block = { type: format, children: [] };
    Transforms.wrapNodes(editor, block);
  }
};

// Rendering components
const Element = ({ attributes, children, element }: any) => {
  const style = { textAlign: element.align };
  
  switch (element.type) {
    case 'block-quote':
      return (
        <blockquote 
          {...attributes} 
          style={style}
          className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-700 dark:text-gray-300 my-4"
        >
          {children}
        </blockquote>
      );
    case 'bulleted-list':
      return (
        <ul {...attributes} style={style} className="list-disc pl-6 my-4">
          {children}
        </ul>
      );
    case 'heading-one':
      return (
        <h1 {...attributes} style={style} className="text-3xl font-bold text-gray-900 dark:text-white my-4">
          {children}
        </h1>
      );
    case 'heading-two':
      return (
        <h2 {...attributes} style={style} className="text-2xl font-semibold text-gray-900 dark:text-white my-3">
          {children}
        </h2>
      );
    case 'list-item':
      return (
        <li {...attributes} style={style} className="my-1">
          {children}
        </li>
      );
    case 'numbered-list':
      return (
        <ol {...attributes} style={style} className="list-decimal pl-6 my-4">
          {children}
        </ol>
      );
    default:
      return (
        <p {...attributes} style={style} className="my-2 text-gray-900 dark:text-white leading-relaxed">
          {children}
        </p>
      );
  }
};

const Leaf = ({ attributes, children, leaf }: any) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }

  if (leaf.code) {
    children = (
      <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  if (leaf.italic) {
    children = <em>{children}</em>;
  }

  if (leaf.underline) {
    children = <u>{children}</u>;
  }

  return <span {...attributes}>{children}</span>;
};

interface SlateEditorProps {
  value?: Descendant[];
  onChange?: (value: Descendant[]) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function SlateEditor({
  value: initialValue,
  onChange,
  placeholder = "Start typing...",
  readOnly = false,
  className,
  autoFocus = false,
  editor: externalEditor // Accept external editor for collaborative editing
}: SlateEditorProps & { editor?: any }) {
  // Use external editor if provided, otherwise create new one
  const editor = useMemo(
    () => externalEditor || withHistory(withReact(createEditor())),
    [externalEditor]
  );

  // Default value
  const defaultValue: Descendant[] = [
    {
      type: 'paragraph',
      children: [{ text: '' }],
    },
  ];

  const [value, setValue] = useState<Descendant[]>(initialValue || defaultValue);

  const handleChange = useCallback((newValue: Descendant[]) => {
    setValue(newValue);
    onChange?.(newValue);
  }, [onChange]);

  const renderElement = useCallback((props: any) => <Element {...props} />, []);
  const renderLeaf = useCallback((props: any) => <Leaf {...props} />, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    switch (event.key) {
      case 'b': {
        event.preventDefault();
        toggleMark(editor, 'bold');
        break;
      }
      case 'i': {
        event.preventDefault();
        toggleMark(editor, 'italic');
        break;
      }
      case 'u': {
        event.preventDefault();
        toggleMark(editor, 'underline');
        break;
      }
      case '`': {
        event.preventDefault();
        toggleMark(editor, 'code');
        break;
      }
    }
  }, [editor]);

  return (
    <div className={cn(
      "w-full min-h-[400px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg",
      className
    )}>
      <Slate editor={editor} initialValue={value} onValueChange={handleChange}>
        <Editable
          className="w-full h-full p-6 outline-none resize-none text-gray-900 dark:text-white"
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder={placeholder}
          readOnly={readOnly}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          spellCheck
          data-testid="slate-editor"
        />
      </Slate>
    </div>
  );
}

// Export helper functions for use by toolbar
export { isMarkActive, toggleMark, isBlockActive, toggleBlock };
export type { CustomElement, CustomText };