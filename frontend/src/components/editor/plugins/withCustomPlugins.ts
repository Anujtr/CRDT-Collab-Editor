import { Editor, Transforms, Range, Point, Element as SlateElement } from 'slate';

// Plugin to handle Enter key behavior in lists
export const withLists = (editor: Editor) => {
  const { deleteBackward, insertBreak } = editor;

  editor.insertBreak = () => {
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      const [match] = Array.from(Editor.nodes(editor, {
        match: n =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          n.type === 'list-item',
      }));

      if (match) {
        const [, path] = match;
        const start = Editor.start(editor, path);
        const range = { anchor: selection.anchor, focus: start };
        const beforeText = Editor.string(editor, range);

        // If the list item is empty, exit the list
        if (beforeText === '') {
          Transforms.unwrapNodes(editor, {
            match: n =>
              !Editor.isEditor(n) &&
              SlateElement.isElement(n) &&
              ['bulleted-list', 'numbered-list'].includes(n.type),
            split: true,
          });
          Transforms.setNodes(editor, { type: 'paragraph' });
          return;
        }
      }
    }

    insertBreak();
  };

  editor.deleteBackward = (...args) => {
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      const [match] = Array.from(Editor.nodes(editor, {
        match: n =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          n.type === 'list-item',
      }));

      if (match) {
        const [, path] = match;
        const start = Editor.start(editor, path);

        if (Point.equals(selection.anchor, start)) {
          // At the beginning of list item, convert to paragraph
          Transforms.unwrapNodes(editor, {
            match: n =>
              !Editor.isEditor(n) &&
              SlateElement.isElement(n) &&
              ['bulleted-list', 'numbered-list'].includes(n.type),
            split: true,
          });
          Transforms.setNodes(editor, { type: 'paragraph' });
          return;
        }
      }
    }

    deleteBackward(...args);
  };

  return editor;
};

// Plugin to handle auto-formatting (e.g., markdown shortcuts)
export const withAutoFormat = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    const { selection } = editor;

    if (text === ' ' && selection && Range.isCollapsed(selection)) {
      const { anchor } = selection;
      const block = Editor.above(editor, {
        match: n => !Editor.isEditor(n) && SlateElement.isElement(n),
      });
      const path = block ? block[1] : [];
      const start = Editor.start(editor, path);
      const range = { anchor, focus: start };
      const beforeText = Editor.string(editor, range);

      // Handle markdown-style shortcuts
      switch (beforeText) {
        case '#':
          Transforms.select(editor, range);
          Transforms.delete(editor);
          Transforms.setNodes(editor, { type: 'heading-one' });
          return;
        case '##':
          Transforms.select(editor, range);
          Transforms.delete(editor);
          Transforms.setNodes(editor, { type: 'heading-two' });
          return;
        case '>':
          Transforms.select(editor, range);
          Transforms.delete(editor);
          Transforms.setNodes(editor, { type: 'block-quote' });
          return;
        case '*':
        case '-':
          Transforms.select(editor, range);
          Transforms.delete(editor);
          Transforms.setNodes(editor, { type: 'list-item' });
          Transforms.wrapNodes(editor, { type: 'bulleted-list', children: [] });
          return;
        case '1.':
          Transforms.select(editor, range);
          Transforms.delete(editor);
          Transforms.setNodes(editor, { type: 'list-item' });
          Transforms.wrapNodes(editor, { type: 'numbered-list', children: [] });
          return;
      }
    }

    insertText(text);
  };

  return editor;
};

// Plugin to handle paste behavior
export const withPaste = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = (data) => {
    const text = data.getData('text/plain');

    if (text) {
      // Handle pasting of URLs
      const urlRegex = /^https?:\/\/[^\s]+$/;
      if (urlRegex.test(text.trim())) {
        // For now, just insert as text. In the future, we could create link nodes
        Transforms.insertText(editor, text);
        return;
      }

      // Handle multi-line paste
      const lines = text.split('\n');
      if (lines.length > 1) {
        lines.forEach((line, index) => {
          if (index > 0) {
            editor.insertBreak();
          }
          Transforms.insertText(editor, line);
        });
        return;
      }
    }

    insertData(data);
  };

  return editor;
};

// Plugin to handle normalization
export const withNormalization = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    // Ensure lists contain only list-items
    if (SlateElement.isElement(node) && ['bulleted-list', 'numbered-list'].includes(node.type)) {
      for (const [child, childPath] of Array.from(Editor.nodes(editor, { at: path }))) {
        if (SlateElement.isElement(child) && child.type !== 'list-item') {
          Transforms.setNodes(editor, { type: 'list-item' }, { at: childPath });
          return;
        }
      }
    }

    // Ensure list-items are only inside lists
    if (SlateElement.isElement(node) && node.type === 'list-item') {
      const parent = Editor.parent(editor, path);
      if (parent && SlateElement.isElement(parent[0]) && 
          !['bulleted-list', 'numbered-list'].includes(parent[0].type)) {
        Transforms.setNodes(editor, { type: 'paragraph' }, { at: path });
        return;
      }
    }

    normalizeNode(entry);
  };

  return editor;
};

// Plugin to handle drag and drop (placeholder)
export const withDragDrop = (editor: Editor) => {
  // This would handle drag and drop functionality
  // For now, we'll keep the default behavior
  return editor;
};

// Plugin to prevent certain operations on read-only editors
export const withReadOnly = (editor: Editor, readOnly: boolean) => {
  if (!readOnly) return editor;

  editor.insertText = () => {};
  editor.insertBreak = () => {};
  editor.deleteBackward = () => {};
  editor.deleteForward = () => {};
  editor.insertData = () => {};

  return editor;
};

// Main plugin composer
export const withCustomPlugins = (editor: Editor, options: { readOnly?: boolean } = {}) => {
  let enhancedEditor = editor;

  // Apply plugins in order
  enhancedEditor = withNormalization(enhancedEditor);
  enhancedEditor = withLists(enhancedEditor);
  enhancedEditor = withAutoFormat(enhancedEditor);
  enhancedEditor = withPaste(enhancedEditor);
  enhancedEditor = withDragDrop(enhancedEditor);
  
  // Apply read-only plugin last if needed
  if (options.readOnly) {
    enhancedEditor = withReadOnly(enhancedEditor, true);
  }

  return enhancedEditor;
};