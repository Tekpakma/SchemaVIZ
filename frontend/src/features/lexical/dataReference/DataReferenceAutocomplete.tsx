import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type {
  MenuRenderFn,
  MenuTextMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
} from 'lexical'
import type { RangeSelection, TextNode } from 'lexical'

import { $createDataReferenceNode } from './DataReferenceNode'
import type { DataReferenceSuggestion } from './useDataReferenceSuggestions'
import { useDataReferenceSuggestions } from './useDataReferenceSuggestions'

import { useLexicalOverlayRuntime } from '../LexicalOverlayRuntimeContext'
import { extractSelectionStyles } from './styles'
import type { SchemaModelRef } from './schemaQueries'

const TRIGGER = '{{'
const TRIGGER_END = '}}'

class DataReferenceOption extends MenuOption {
  readonly suggestion: DataReferenceSuggestion

  constructor(suggestion: DataReferenceSuggestion) {
    super(suggestion.fieldName)
    this.suggestion = suggestion
  }
}

/**
 * Matches an unfinished `{{...` template before the cursor.
 *
 * Returns `null` once a closing `}}` exists after the latest trigger, so the
 * typeahead only handles incomplete references.
 */
function matchTrigger(text: string): MenuTextMatch | null {
  const triggerIndex = text.lastIndexOf(TRIGGER)
  if (triggerIndex === -1) return null

  const closingIndex = text.indexOf(TRIGGER_END, triggerIndex + TRIGGER.length)
  if (closingIndex !== -1) return null

  const matchingString = text.slice(triggerIndex + TRIGGER.length)
  if (matchingString.includes('\n')) return null

  return {
    leadOffset: triggerIndex,
    matchingString,
    replaceableString: text.slice(triggerIndex),
  }
}

/**
 * Writes text into the editor at the current position. When the typeahead
 * provides a `textNode` (the node containing the trigger), we replace its
 * content directly; otherwise we fall back to inserting at the selection.
 */
function insertTextIntoNode(
  textNode: TextNode | null,
  text: string,
  selection: RangeSelection,
): void {
  if (textNode) {
    textNode.setTextContent(text)
    textNode.selectEnd()
    return
  }

  selection.insertText(text)
}

function DataReferenceAutocompleteInner({
  dataScope,
}: {
  dataScope: SchemaModelRef
}): React.ReactElement {
  const [queryText, setQueryText] = useState('')

  const suggestions = useDataReferenceSuggestions(
    dataScope,
    queryText,
    { includeRelationRoots: true },
  )

  const menuOptions = useMemo(
    () => suggestions.map((suggestion) => new DataReferenceOption(suggestion)),
    [suggestions],
  )

  const onSelectOption = useCallback(
    (
      selectedOption: DataReferenceOption,
      textNodeContainingQuery: TextNode | null,
      closeMenu: () => void,
    ) => {
      const selection = $getSelection()

      if (!$isRangeSelection(selection)) {
        closeMenu()
        return
      }

      const { suggestion } = selectedOption

      // Relation roots (e.g. "author.") are incomplete paths — append to the
      // trigger text so the user can continue drilling into the relation.
      if (suggestion.source === 'relation-root') {
        insertTextIntoNode(
          textNodeContainingQuery,
          `${TRIGGER}${suggestion.fieldName}`,
          selection,
        )
        setQueryText(suggestion.fieldName)
        return
      }

      const styles = extractSelectionStyles(selection)
      const dataReferenceNode = $createDataReferenceNode(
        suggestion.fieldName,
        styles,
      )

      if (textNodeContainingQuery) {
        textNodeContainingQuery.replace(dataReferenceNode)
      } else {
        selection.insertNodes([dataReferenceNode])
      }

      closeMenu()
      setQueryText('')
    },
    [],
  )

  const menuRenderFn = useCallback<MenuRenderFn<DataReferenceOption>>(
    (
      anchorElementRef,
      {
        options: items,
        selectedIndex,
        selectOptionAndCleanUp,
        setHighlightedIndex,
      },
    ) => {
      if (!anchorElementRef.current || items.length === 0) return null

      const anchorRect =
        anchorElementRef.current.getBoundingClientRect()

      return createPortal(
        <div
          className="fixed z-[9999] w-60 min-w-60 max-w-[400px] max-h-60 overflow-hidden rounded-md border border-input bg-background shadow-md"
          style={{
            top: anchorRect.bottom,
            left: anchorRect.left,
          }}
        >
          <ul className="max-h-52 overflow-auto py-1" role="listbox">
            {items.map((option, index) => {
              const isSelected = index === selectedIndex

              return (
                <li
                  key={option.key}
                  ref={option.setRefElement}
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? 'bg-primary/10' : undefined}
                >
                  <button
                    type="button"
                    className="flex w-full cursor-pointer flex-col px-2 py-1 text-left text-sm"
                    onMouseMove={() => {
                      if (!isSelected) setHighlightedIndex(index)
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOptionAndCleanUp(option)}
                  >
                    <span className="font-medium">
                      {option.suggestion.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {option.suggestion.description}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )
    },
    [],
  )

  return (
    <LexicalTypeaheadMenuPlugin
      options={menuOptions}
      onQueryChange={(matchingString) => {
        setQueryText(matchingString ?? '')
      }}
      onSelectOption={onSelectOption}
      menuRenderFn={menuRenderFn}
      triggerFn={matchTrigger}
      commandPriority={COMMAND_PRIORITY_HIGH}
      preselectFirstItem
    />
  )
}

export function DataReferenceAutocomplete(): React.ReactElement | null {
  const { dataScope } = useLexicalOverlayRuntime()
  if (!dataScope) return null
  return <DataReferenceAutocompleteInner dataScope={dataScope} />
}
