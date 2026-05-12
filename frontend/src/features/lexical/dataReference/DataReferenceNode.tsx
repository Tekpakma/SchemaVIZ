import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  TextFormatType,
} from 'lexical'
import { DecoratorNode } from 'lexical'
import { DataReferenceChip } from './DataReferenceChip'
import { normalizeStyleObject } from './styles'

/**
 * Inline style record stored on DataReferenceNodes.
 *
 * Keys are always camelCase — enforced by {@link normalizeStyleObject} at every
 * entry point (constructor, patchStyles).
 */
export type DataReferenceInlineStyle = Record<string, string>

export type SerializedDataReferenceNode = Spread<
  {
    path: string
    styles: DataReferenceInlineStyle
  },
  SerializedLexicalNode
>

export class DataReferenceNode extends DecoratorNode<React.ReactElement> {
  __path: string
  __styles: DataReferenceInlineStyle

  static getType(): string {
    return 'data-reference'
  }

  static clone(node: DataReferenceNode): DataReferenceNode {
    return new DataReferenceNode(node.__path, node.__styles, node.__key)
  }

  constructor(
    path: string,
    styles: DataReferenceInlineStyle = {},
    key?: NodeKey,
  ) {
    super(key)
    this.__path = path
    this.__styles = normalizeStyleObject(styles)
  }

  createDOM(): HTMLElement {
    const element = document.createElement('span')
    element.style.display = 'inline-block'
    element.setAttribute('data-lexical-data-reference', 'true')
    return element
  }

  updateDOM(): false {
    return false
  }

  getPath(): string {
    return this.__path
  }

  setPath(path: string): void {
    const writableNode = this.getWritable()
    writableNode.__path = path
  }

  getStyles(): DataReferenceInlineStyle {
    return this.__styles
  }

  patchStyles(styles: DataReferenceInlineStyle): void {
    const writableNode = this.getWritable()
    writableNode.__styles = {
      ...writableNode.__styles,
      ...normalizeStyleObject(styles),
    }
  }

  toggleTextFormat(format: TextFormatType): void {
    const writableNode = this.getWritable()
    const s = writableNode.__styles
    if (format === 'bold') {
      s.fontWeight = s.fontWeight === 'bold' ? 'normal' : 'bold'
      return
    }
    if (format === 'italic') {
      s.fontStyle = s.fontStyle === 'italic' ? 'normal' : 'italic'
      return
    }
    if (format === 'underline') {
      s.textDecoration = s.textDecoration === 'underline' ? 'none' : 'underline'
    }
  }

  getTextContent(): string {
    return `{{${this.__path}}}`
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span')
    element.textContent = this.getTextContent()
    element.setAttribute('data-lexical-data-reference', this.__path)
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (domNode.hasAttribute('data-lexical-data-reference')) {
          return {
            conversion: convertDataReferenceElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  exportJSON(): SerializedDataReferenceNode {
    return {
      path: this.__path,
      styles: this.__styles,
      type: 'data-reference',
      version: 1,
    }
  }

  static importJSON(
    serializedNode: SerializedDataReferenceNode,
  ): DataReferenceNode {
    return $createDataReferenceNode(
      serializedNode.path,
      serializedNode.styles,
    )
  }

  decorate(): React.ReactElement {
    return (
      <DataReferenceChip
        fieldName={this.__path}
        nodeKey={this.getKey()}
        styles={this.__styles}
      />
    )
  }

  isInline(): boolean {
    return true
  }

  isKeyboardSelectable(): boolean {
    return true
  }

}

function convertDataReferenceElement(
  domNode: HTMLElement,
): DOMConversionOutput {
  const path = domNode.getAttribute('data-lexical-data-reference')
  if (path) {
    return { node: $createDataReferenceNode(path) }
  }
  return { node: null }
}

export function $createDataReferenceNode(
  fieldName: string,
  styles: DataReferenceInlineStyle = {},
): DataReferenceNode {
  return new DataReferenceNode(fieldName, styles)
}

export function $isDataReferenceNode(
  node: LexicalNode | null | undefined,
): node is DataReferenceNode {
  return node instanceof DataReferenceNode
}
