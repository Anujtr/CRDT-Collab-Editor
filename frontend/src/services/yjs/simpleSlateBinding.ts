import * as Y from 'yjs';
import { Editor, Transforms, Descendant, Text as SlateText } from 'slate';
import { ReactEditor } from 'slate-react';

// Simplified Yjs to Slate binding for basic text editing
export class SimpleSlateYjsBinding {
  private editor: Editor;
  private yText: Y.Text;
  private doc: Y.Doc;
  private isLocalChange = false;
  private isRemoteChange = false;
  private lastValue: Descendant[] = [];

  constructor(editor: Editor, doc: Y.Doc, yTextName: string = 'content') {
    this.editor = editor;
    this.doc = doc;
    this.yText = doc.getText(yTextName);

    this.setupBindings();
  }

  private setupBindings(): void {
    // Listen for Yjs changes and apply to Slate
    this.yText.observe(this.handleYjsChange.bind(this));

    // Listen for Slate changes and apply to Yjs
    this.setupSlateObserver();

    // Initial sync from Yjs to Slate
    this.syncYjsToSlate();
  }

  private handleYjsChange(): void {
    if (this.isLocalChange) {
      return; // Ignore changes that originated from this binding
    }

    console.log('SimpleBinding: Yjs change detected');
    this.isRemoteChange = true;

    try {
      this.syncYjsToSlate();
    } catch (error) {
      console.error('Error applying Yjs changes to Slate:', error);
    } finally {
      this.isRemoteChange = false;
    }
  }

  private setupSlateObserver(): void {
    // Override editor operations to sync with Yjs
    const originalApply = this.editor.apply.bind(this.editor);

    this.editor.apply = (operation: any) => {
      // Apply operation to Slate first
      originalApply(operation);

      // Skip syncing if this is a remote change
      if (this.isRemoteChange) {
        return;
      }

      // Skip syncing selection operations
      if (operation.type === 'set_selection') {
        return;
      }

      // Sync to Yjs after a small delay to batch operations
      this.isLocalChange = true;
      try {
        // Use setTimeout to batch rapid changes
        setTimeout(() => {
          if (this.isLocalChange) {
            this.syncSlateToYjs();
            this.isLocalChange = false;
          }
        }, 10);
      } catch (error) {
        console.error('Error syncing Slate to Yjs:', error);
        this.isLocalChange = false;
      }
    };
  }

  private syncSlateToYjs(): void {
    try {
      const slateText = this.slateToText();
      const yjsText = this.yText.toString();

      if (slateText !== yjsText) {
        console.log('SimpleBinding: Syncing Slate to Yjs');
        
        // Replace entire Yjs text content
        this.yText.delete(0, this.yText.length);
        this.yText.insert(0, slateText);
      }
    } catch (error) {
      console.error('Error syncing Slate to Yjs:', error);
    }
  }

  private syncYjsToSlate(): void {
    try {
      const yjsText = this.yText.toString();
      const slateText = this.slateToText();

      if (yjsText !== slateText) {
        console.log('SimpleBinding: Syncing Yjs to Slate');
        
        const newValue = this.textToSlateNodes(yjsText);
        
        // Store current selection
        const selection = this.editor.selection;
        
        Editor.withoutNormalizing(this.editor, () => {
          // Clear current content
          const range = Editor.range(this.editor, []);
          Transforms.select(this.editor, range);
          Transforms.delete(this.editor);
          
          // Insert new content
          Transforms.insertNodes(this.editor, newValue);
        });

        // Try to restore selection if it was valid
        if (selection && this.isValidSelection(selection, newValue)) {
          try {
            Transforms.select(this.editor, selection);
          } catch (selectionError) {
            console.warn('Could not restore selection:', selectionError);
            // Place cursor at end
            Transforms.select(this.editor, Editor.end(this.editor, []));
          }
        }

        this.lastValue = newValue;
      }
    } catch (error) {
      console.error('Error syncing Yjs to Slate:', error);
    }
  }

  private slateToText(): string {
    try {
      const value = this.editor.children;
      return value.map(node => {
        if ('children' in node) {
          return node.children.map((child: any) => {
            if (SlateText.isText(child)) {
              return child.text || '';
            }
            return '';
          }).join('');
        }
        return '';
      }).join('\n');
    } catch (error) {
      console.error('Error converting Slate to text:', error);
      return '';
    }
  }

  private textToSlateNodes(text: string): Descendant[] {
    if (!text) {
      return [{
        type: 'paragraph',
        children: [{ text: '' }]
      }];
    }

    return text.split('\n').map(line => ({
      type: 'paragraph',
      children: [{ text: line }]
    }));
  }

  private isValidSelection(selection: any, nodes: Descendant[]): boolean {
    try {
      // Simple validation - check if selection paths exist
      if (!selection || !selection.anchor || !selection.focus) {
        return false;
      }

      const anchorPath = selection.anchor.path;
      const focusPath = selection.focus.path;

      return this.isValidPath(anchorPath, nodes) && this.isValidPath(focusPath, nodes);
    } catch {
      return false;
    }
  }

  private isValidPath(path: number[], nodes: Descendant[]): boolean {
    try {
      if (!path || path.length === 0) return false;
      
      let current: any = { children: nodes };
      
      for (let i = 0; i < path.length; i++) {
        const index = path[i];
        if (!current.children || !current.children[index]) {
          return false;
        }
        current = current.children[index];
      }
      
      return true;
    } catch {
      return false;
    }
  }

  destroy(): void {
    console.log('SimpleBinding: Destroying binding');
    
    // Remove Yjs observer
    this.yText.unobserve(this.handleYjsChange.bind(this));
    
    // Restore original editor apply method if possible
    // Note: In a real implementation, we'd store the original method
  }
}

// Factory function to create the binding
export function connectSlateWithYjs(editor: Editor, doc: Y.Doc, yTextName: string = 'content'): SimpleSlateYjsBinding {
  return new SimpleSlateYjsBinding(editor, doc, yTextName);
}