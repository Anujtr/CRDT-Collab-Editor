import * as Y from 'yjs';
import { Editor, Transforms, Operation, Path, Node, Text, Element as SlateElement } from 'slate';

// Yjs to Slate operations conversion
export class SlateYjsBinding {
  private editor: Editor;
  private yText: Y.Text;
  private doc: Y.Doc;
  private isLocalChange = false;
  private isRemoteChange = false;

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

  private handleYjsChange(event: Y.YTextEvent): void {
    if (this.isLocalChange) {
      return; // Ignore changes that originated from this binding
    }

    this.isRemoteChange = true;

    try {
      // Convert Yjs changes to Slate operations
      const operations = this.convertYjsEventToSlateOperations(event);

      if (operations.length > 0) {
        Editor.withoutNormalizing(this.editor, () => {
          operations.forEach(op => {
            this.editor.apply(op);
          });
        });
      }
    } catch (error) {
      console.error('Error applying Yjs changes to Slate:', error);
      // If individual operations fail, do a full sync
      this.syncYjsToSlate();
    } finally {
      this.isRemoteChange = false;
    }
  }

  private convertYjsEventToSlateOperations(event: Y.YTextEvent): Operation[] {
    const operations: Operation[] = [];
    let offset = 0;

    for (const delta of event.changes.delta) {
      if (delta.retain) {
        offset += delta.retain;
      } else if (delta.delete) {
        // Create delete operation
        const path = this.offsetToPath(offset);
        if (path) {
          operations.push({
            type: 'remove_text',
            path,
            offset: path[path.length - 1],
            text: this.yText.toString().substr(offset, delta.delete)
          });
        }
      } else if (delta.insert) {
        // Create insert operation
        const path = this.offsetToPath(offset);
        if (path) {
          operations.push({
            type: 'insert_text',
            path,
            offset: path[path.length - 1],
            text: delta.insert as string
          });
        }
        offset += (delta.insert as string).length;
      }
    }

    return operations;
  }

  private setupSlateObserver(): void {
    // Override editor operations to sync with Yjs
    const originalApply = this.editor.apply.bind(this.editor);

    this.editor.apply = (operation: Operation) => {
      if (this.isRemoteChange) {
        // Don't sync operations that came from Yjs
        originalApply(operation);
        return;
      }

      // Apply operation to Slate first
      originalApply(operation);

      // Then sync to Yjs
      this.isLocalChange = true;
      try {
        this.syncSlateOperationToYjs(operation);
      } catch (error) {
        console.error('Error syncing Slate operation to Yjs:', error);
      } finally {
        this.isLocalChange = false;
      }
    };
  }

  private syncSlateOperationToYjs(operation: Operation): void {
    switch (operation.type) {
      case 'insert_text':
        {
          const offset = this.pathToOffset(operation.path) + operation.offset;
          this.yText.insert(offset, operation.text);
        }
        break;

      case 'remove_text':
        {
          const offset = this.pathToOffset(operation.path) + operation.offset;
          this.yText.delete(offset, operation.text.length);
        }
        break;

      case 'insert_node':
        {
          const text = this.nodeToText(operation.node);
          const offset = this.pathToOffset(operation.path);
          this.yText.insert(offset, text);
        }
        break;

      case 'remove_node':
        {
          const text = this.nodeToText(operation.node);
          const offset = this.pathToOffset(operation.path);
          this.yText.delete(offset, text.length);
        }
        break;

      case 'split_node':
        {
          // Insert a newline or paragraph break
          const offset = this.pathToOffset(operation.path) + operation.position;
          this.yText.insert(offset, '\n');
        }
        break;

      case 'merge_node':
        {
          // Remove the paragraph break
          const offset = this.pathToOffset(operation.path);
          // Find the position where nodes were merged and remove separator
          this.yText.delete(offset - 1, 1); // Remove the separator
        }
        break;

      // For other operations, do a full sync to be safe
      default:
        console.log('Unhandled operation type:', operation.type);
        break;
    }
  }

  private syncYjsToSlate(): void {
    const yjsText = this.yText.toString();
    const slateText = this.slateToText();

    if (yjsText !== slateText) {
      this.isRemoteChange = true;
      try {
        // Replace entire content
        const children = this.textToSlateNodes(yjsText);
        
        Editor.withoutNormalizing(this.editor, () => {
          // Clear current content
          Transforms.select(this.editor, []);
          Transforms.delete(this.editor, { at: [] });
          
          // Insert new content
          Transforms.insertNodes(this.editor, children, { at: [0] });
        });
      } finally {
        this.isRemoteChange = false;
      }
    }
  }

  private pathToOffset(path: Path): number {
    let offset = 0;
    let currentNode = this.editor;

    for (let i = 0; i < path.length; i++) {
      const index = path[i];
      
      if (i === path.length - 1) {
        // Last level - add character offset
        offset += index;
      } else {
        // Node level - add text content of previous nodes
        for (let j = 0; j < index; j++) {
          const node = currentNode.children[j];
          offset += this.nodeToText(node).length;
        }
        currentNode = currentNode.children[index] as any;
      }
    }

    return offset;
  }

  private offsetToPath(offset: number): Path | null {
    let currentOffset = 0;
    const path: Path = [];

    const traverse = (node: Node, depth: number): boolean => {
      if (Text.isText(node)) {
        if (currentOffset + node.text.length >= offset) {
          path.push(offset - currentOffset);
          return true;
        }
        currentOffset += node.text.length;
        return false;
      }

      if (SlateElement.isElement(node)) {
        for (let i = 0; i < node.children.length; i++) {
          path[depth] = i;
          if (traverse(node.children[i], depth + 1)) {
            return true;
          }
        }
        path.pop();
      }

      return false;
    };

    // Start traversal from editor root
    for (let i = 0; i < this.editor.children.length; i++) {
      path[0] = i;
      if (traverse(this.editor.children[i], 1)) {
        return path;
      }
    }

    return null;
  }

  private nodeToText(node: Node): string {
    if (Text.isText(node)) {
      return node.text;
    }

    if (SlateElement.isElement(node)) {
      return node.children.map(child => this.nodeToText(child)).join('');
    }

    return '';
  }

  private slateToText(): string {
    return this.editor.children.map(node => this.nodeToText(node)).join('\n');
  }

  private textToSlateNodes(text: string): Node[] {
    if (!text) {
      return [{
        type: 'paragraph',
        children: [{ text: '' }]
      }];
    }

    // Split by newlines and create paragraph nodes
    const lines = text.split('\n');
    return lines.map(line => ({
      type: 'paragraph',
      children: [{ text: line }]
    }));
  }

  // Public methods for external use
  public getYjsText(): Y.Text {
    return this.yText;
  }

  public getYjsDoc(): Y.Doc {
    return this.doc;
  }

  public forceSync(): void {
    this.syncYjsToSlate();
  }

  public destroy(): void {
    // Clean up observers
    this.yText.unobserve(this.handleYjsChange);
    
    // Restore original editor.apply
    // Note: In a real implementation, you'd want to store the original
    // and restore it properly
  }
}

// Helper function to create and connect a Slate editor with Yjs
export function connectSlateWithYjs(
  editor: Editor,
  doc: Y.Doc,
  yTextName: string = 'content'
): SlateYjsBinding {
  return new SlateYjsBinding(editor, doc, yTextName);
}