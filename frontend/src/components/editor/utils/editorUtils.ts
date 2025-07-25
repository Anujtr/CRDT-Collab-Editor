import { Editor, Transforms, Range, Element as SlateElement, Text } from 'slate';
import { CustomElement, CustomText } from '../SlateEditor';

// Text formatting utilities
export const EditorUtils = {
  // Mark utilities
  isMarkActive: (editor: Editor, format: keyof Omit<CustomText, 'text'>): boolean => {
    const marks = Editor.marks(editor);
    return marks ? marks[format] === true : false;
  },

  toggleMark: (editor: Editor, format: keyof Omit<CustomText, 'text'>): void => {
    const isActive = EditorUtils.isMarkActive(editor, format);

    if (isActive) {
      Editor.removeMark(editor, format);
    } else {
      Editor.addMark(editor, format, true);
    }
  },

  // Block utilities
  isBlockActive: (editor: Editor, format: CustomElement['type']): boolean => {
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
  },

  toggleBlock: (editor: Editor, format: CustomElement['type']): void => {
    const isActive = EditorUtils.isBlockActive(editor, format);
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
  },

  // Alignment utilities
  isAlignmentActive: (editor: Editor, alignment: 'left' | 'center' | 'right' | 'justify'): boolean => {
    const { selection } = editor;
    if (!selection) return alignment === 'left'; // Default alignment

    const [match] = Array.from(
      Editor.nodes(editor, {
        at: Editor.unhangRange(editor, selection),
        match: n =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          (n as any).align === alignment,
      })
    );

    return !!match;
  },

  toggleAlignment: (editor: Editor, alignment: 'left' | 'center' | 'right' | 'justify'): void => {
    const isActive = EditorUtils.isAlignmentActive(editor, alignment);
    
    Transforms.setNodes(
      editor,
      { align: isActive ? undefined : alignment },
      { match: n => !Editor.isEditor(n) && SlateElement.isElement(n) }
    );
  },

  // Selection utilities
  getSelectedText: (editor: Editor): string => {
    const { selection } = editor;
    if (!selection || Range.isCollapsed(selection)) {
      return '';
    }

    return Editor.string(editor, selection);
  },

  hasSelection: (editor: Editor): boolean => {
    const { selection } = editor;
    return !!selection && !Range.isCollapsed(selection);
  },

  // Insertion utilities
  insertText: (editor: Editor, text: string): void => {
    Transforms.insertText(editor, text);
  },

  insertBreak: (editor: Editor): void => {
    Transforms.insertBreak(editor);
  },

  // Content utilities
  isEmpty: (editor: Editor): boolean => {
    const { children } = editor;
    return (
      children.length === 1 &&
      children[0].type === 'paragraph' &&
      children[0].children.length === 1 &&
      Text.isText(children[0].children[0]) &&
      children[0].children[0].text === ''
    );
  },

  getTextContent: (editor: Editor): string => {
    return Editor.string(editor, []);
  },

  // Focus utilities
  focus: (editor: Editor): void => {
    Transforms.select(editor, Editor.end(editor, []));
  },

  blur: (editor: Editor): void => {
    Transforms.deselect(editor);
  },

  // Formatting shortcuts
  applyFormatting: {
    bold: (editor: Editor) => EditorUtils.toggleMark(editor, 'bold'),
    italic: (editor: Editor) => EditorUtils.toggleMark(editor, 'italic'),
    underline: (editor: Editor) => EditorUtils.toggleMark(editor, 'underline'),
    code: (editor: Editor) => EditorUtils.toggleMark(editor, 'code'),
    
    heading1: (editor: Editor) => EditorUtils.toggleBlock(editor, 'heading-one'),
    heading2: (editor: Editor) => EditorUtils.toggleBlock(editor, 'heading-two'),
    paragraph: (editor: Editor) => EditorUtils.toggleBlock(editor, 'paragraph'),
    blockquote: (editor: Editor) => EditorUtils.toggleBlock(editor, 'block-quote'),
    
    bulletedList: (editor: Editor) => EditorUtils.toggleBlock(editor, 'bulleted-list'),
    numberedList: (editor: Editor) => EditorUtils.toggleBlock(editor, 'numbered-list'),
    
    alignLeft: (editor: Editor) => EditorUtils.toggleAlignment(editor, 'left'),
    alignCenter: (editor: Editor) => EditorUtils.toggleAlignment(editor, 'center'),
    alignRight: (editor: Editor) => EditorUtils.toggleAlignment(editor, 'right'),
    alignJustify: (editor: Editor) => EditorUtils.toggleAlignment(editor, 'justify'),
  },

  // Keyboard shortcut handler
  handleKeyboardShortcut: (editor: Editor, event: KeyboardEvent): boolean => {
    const { ctrlKey, metaKey, key } = event;
    const isModifier = ctrlKey || metaKey;

    if (!isModifier) return false;

    switch (key) {
      case 'b':
        event.preventDefault();
        EditorUtils.applyFormatting.bold(editor);
        return true;
      case 'i':
        event.preventDefault();
        EditorUtils.applyFormatting.italic(editor);
        return true;
      case 'u':
        event.preventDefault();
        EditorUtils.applyFormatting.underline(editor);
        return true;
      case '`':
        event.preventDefault();
        EditorUtils.applyFormatting.code(editor);
        return true;
      case '1':
        if (event.shiftKey) {
          event.preventDefault();
          EditorUtils.applyFormatting.heading1(editor);
          return true;
        }
        break;
      case '2':
        if (event.shiftKey) {
          event.preventDefault();
          EditorUtils.applyFormatting.heading2(editor);
          return true;
        }
        break;
      default:
        return false;
    }

    return false;
  },

  // Content validation
  validateContent: (content: any[]): boolean => {
    try {
      // Basic validation to ensure content is valid Slate.js structure
      return Array.isArray(content) && content.every(node => 
        typeof node === 'object' && 
        node !== null && 
        'type' in node && 
        'children' in node
      );
    } catch {
      return false;
    }
  },

  // Serialization utilities
  serialize: (nodes: any[]): string => {
    return nodes.map(n => Editor.string({ children: [n] } as any, [])).join('\n');
  },

  // Word count utility
  getWordCount: (editor: Editor): number => {
    const text = EditorUtils.getTextContent(editor);
    return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  },

  getCharacterCount: (editor: Editor): number => {
    return EditorUtils.getTextContent(editor).length;
  }
};