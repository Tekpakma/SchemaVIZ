export const resources = {
  de: {
    translation: {
      language: {
        de: 'Deutsch',
        en: 'English',
        label: 'Sprache',
      },
      theme: {
        dark: 'Dunkel',
        label: 'Darstellung',
        light: 'Hell',
        system: 'System',
      },
      preferences: {
        label: 'Einstellungen',
      },
      builder: {
        examples: {
          defaultBadge: 'Standard',
          descriptionEnd: 'wenn das Template geoeffnet wird.',
          descriptionStart: 'Jedes Beispiel wird ein gueltiger',
          empty: 'Keine Datensaetze gefunden.',
          loadError: 'Datensaetze konnten nicht geladen werden.',
          loading: 'Datensaetze werden geladen...',
          needsStartModel:
            'Fuegen Sie zuerst ein Startmodell in Schritt 1 hinzu.',
          openActions: 'Aktionen fuer {{example}} oeffnen',
          pickerDescription:
            'Einen Datensatz von {{model}} suchen und als Beispiel pinnen.',
          pickerSearch: 'Datensaetze suchen...',
          pickerTitle: 'Beispieldatensatz waehlen',
          pinRecord: '+ Beispieldatensatz pinnen',
          previewBadge: 'Vorschau',
          removeRecord: 'Entfernen',
          setDefault: 'Als Standard setzen',
          startingRecord: 'Startdatensatz',
        },
        grouping: {
          addRule: 'Gruppierungsregel hinzufuegen',
          description:
            'Klicke auf eine Beziehung um den Anzeigemodus zu wechseln: Baum → Gruppe → Breakout.',
          empty:
            'Keine Gruppierungsregeln.',
          hint: 'Gruppe: Kinder werden im Eltern-Knoten gezeichnet. Breakout: Knoten bricht aus der Eltern-Gruppe aus.',
          mode_breakout: 'Breakout',
          mode_group: 'Gruppe',
          mode_none: 'Baum',
          noEdges: 'Definiere zuerst Traversal-Beziehungen in Schritt 2.',
          removeRule: 'Regel entfernen',
        },
        filters: {
          addFilter: 'Hinzufuegen',
          description:
            'QLab-Filter fuer einzelne Modelle. Die Vorschau und Ausfuehrung verwenden dieselbe validierte Filterstruktur.',
          empty: 'Noch keine Filter.',
          fieldLabel: 'Feld',
          metadataError: 'QLab-Felder konnten nicht geladen werden.',
          modelLabel: 'Modell',
          operatorLabel: 'Operator',
          removeFilter: 'Filter entfernen',
          suggestedBadge: 'Vorschlag',
          valueLabel: 'Wert',
        },
        header: {
          back: 'Zurueck',
          loadingRecords: 'Lade Datensaetze…',
          noRecordsFound: 'Keine Datensaetze gefunden.',
          pinnedRecords: 'Gespeicherte Datensaetze',
          preview: 'Vorschau',
          previewPickerDescription:
            'Waehle einen {{model}}-Datensatz fuer die Live-Vorschau.',
          previewPickerSearch: 'Datensatz suchen…',
          previewPickerTitle: 'Vorschau-Datensatz',
          promote: 'Veroeffentlichen',
          save: 'Speichern',
          titleLabel: 'Template-Titel',
          titlePlaceholder: 'Unbenanntes Template',
        },
        inspector: {
          next: 'Weiter',
          prev: 'Zurueck',
          stepProgress: 'Schritt {{current}} von {{total}}',
        },
        layerManager: {
          add: 'Ebene hinzufuegen',
          description:
            'Ebenen fuer das Generation-Template hinzufuegen oder entfernen.',
          empty: 'Keine Ebenen gefunden.',
          group: 'Ebenen',
          modelCount: '{{count}} Modelle',
          modelCount_one: '{{count}} Modell',
          modelCount_other: '{{count}} Modelle',
          search: 'Ebenen suchen...',
          title: 'Ebenen verwalten',
        },
        layout: {
          selected: 'ausgewaehlt',
        },
        modelPicker: {
          description:
            'Ein Django-Modell suchen und dem Generation-Template hinzufuegen.',
          empty: 'Keine Modelle gefunden.',
          search: 'Modelle suchen...',
          title: 'Modell hinzufuegen',
        },
        models: {
          addLayer: 'Ebene hinzufuegen',
          addModel: 'Modell hinzufuegen',
          addModelToLayer: 'Modell zu {{layer}}',
          addStartModel: 'Startmodell hinzufuegen',
          empty: 'Noch keine Modelle hinzugefuegt. Klicken zum Hinzufuegen.',
          groupModelCount: '{{count}}',
          groupModelCount_one: '{{count}}',
          groupModelCount_other: '{{count}}',
          layerActions: 'Aktionen fuer {{layer}}',
          layerPlaceholder: 'Ebene',
          layerSelectLabel: 'Ebene fuer {{model}}',
          layerSummary: 'Ebenen',
          layerSummary_one: 'Ebene',
          layerSummary_other: 'Ebenen',
          layers: 'Ebenen',
          loadError: 'Backend-Modelle konnten nicht geladen werden.',
          loading: 'Modelle werden geladen...',
          modelSummary: 'Modelle',
          modelSummary_one: 'Modell',
          modelSummary_other: 'Modelle',
          removeLayer: '{{layer}} entfernen',
          removeModel: '{{model}} entfernen',
          reorderModel: '{{model}} neu sortieren',
          startBadge: 'Start',
          startLayerHint:
            'Nur ein Startpunkt. Weitere Modelle in Ebene 2+ ablegen.',
          startLayerTitle: 'Startpunkt',
          startModelSummary: '{{model}} als Start',
        },
        preview: {
          edgeCount: '{{count}} Verbindungen',
          edgeCount_one: '{{count}} Verbindung',
          edgeCount_other: '{{count}} Verbindungen',
          layerAndEdgeCount: '{{layers}} · {{edges}}',
          layerCount: '{{count}} Ebenen',
          layerCount_one: '{{count}} Ebene',
          layerCount_other: '{{count}} Ebenen',
          recheck: 'Pruefen',
          resolveError: 'Vorschau konnte nicht aufgeloest werden.',
          resolvedFor: 'Aufgeloest fuer {{record}}',
          resolving: 'Wird aufgeloest...',
          retry: 'Erneut versuchen',
          title: 'Vorschau',
        },
        promote: {
          audienceLabel: 'Zielgruppe: {{audience}}',
          empty:
            'Promotion-Einstellungen konfigurieren, um dieses Template mit Ihrer Organisation zu teilen.',
          orgLabel: 'Org: {{org}}',
          visibilityLabel: 'Sichtbarkeit: {{visibility}}',
        },
        sidebar: {
          stepCount: '{{count}} Schritte',
          stepCount_one: '{{count}} Schritt',
          stepCount_other: '{{count}} Schritte',
          title: 'Rezept',
        },
        steps: {
          layers: {
            title: 'Modelle auswählen',
            detail:
              'Backend-Modelle hinzufuegen und einer gemeinsamen Ebene zuordnen. Ebene 1 enthaelt genau ein Modell - den Startpunkt.',
          },
          traversal: {
            title: 'Traversierung & Wegfindung',
            detail:
              'Wie verläuft das Rezept von einem Startpunkt zu jeder Ebene? Automatische Wegfindung, wo eindeutig; ansonsten manuell auswählen.',
          },
          examples: {
            title: 'Beispieldatensätze',
            detail: 'Einen echten Datensatz für jeden Startpunkt testen.',
          },
          filters: {
            title: 'Filter',
            detail:
              'Einschränken, was in jede Ebene gelangt. Django-artige Abfragen, pro Startdatensatz.',
          },
          grouping: {
            title: 'Gruppierung',
            detail:
              'Eltern-Kind-Verschachtelung. Ein Modell wird visuell als Container um seine Kinder gezeichnet.',
          },
          style: {
            title: 'Ebenen gestalten',
            detail: 'Farbe, Form, Dichte — pro Ebene angewendet.',
          },
          layout: {
            title: 'Layout wählen',
            detail:
              'Layout-Algorithmen — geschichtet, Baum, kräftebasiert, radial.',
          },
          promote: {
            title: 'Veröffentlichen',
            detail:
              'Dieses Rezept in Ihrer Organisation veröffentlichen — andere sehen Ihre Landschaft.',
          },
        },
        traversal: {
          addWaypoint: 'Wegpunkt hinzufuegen',
          ambiguousEdges:
            '{{count}} mehrdeutige Verbindung - waehlen Sie den gewuenschten Pfad.',
          ambiguousEdges_one:
            '{{count}} mehrdeutige Verbindung - waehlen Sie den gewuenschten Pfad.',
          ambiguousEdges_other:
            '{{count}} mehrdeutige Verbindungen - waehlen Sie den gewuenschten Pfad.',
          autoBadge: 'auto',
          changeRoute: 'Route aendern',
          costTitle: 'Kosten {{cost}}',
          description:
            'Auto-Wegfindung laeuft durch das Modell. Wenn mehrere Pfade existieren, waehlen Sie einen aus.',
          dialogDescription:
            'Route waehlen fuer {{from}} → {{to}}',
          dialogTitle: 'Route waehlen',
          directGroup: 'Direkt (1 Hop)',
          findingRoutes: 'Routen werden gesucht...',
          hopsGroup: '{{count}} Hops',
          manyHopsGroup: '{{count}}+ Hops',
          needsModels:
            'Fuegen Sie mindestens zwei Modelle auf verschiedenen Ebenen hinzu, um Pfade zu finden.',
          needsPickBadge: 'auswaehlen',
          noRouteFound: 'Keine Route zwischen diesen Modellen gefunden.',
          pickRoute: 'Route waehlen',
          routeError: 'Routen konnten nicht geladen werden.',
          sameLayerHint:
            'Alle Modelle befinden sich auf derselben Ebene. Verteilen Sie sie auf verschiedene Ebenen, um Pfade zu finden.',
          searchRoutes: 'Routen durchsuchen...',
          viaWaypoints: 'ueber {{waypoints}}',
        },
      },
    },
  },
  en: {
    translation: {
      language: {
        de: 'Deutsch',
        en: 'English',
        label: 'Language',
      },
      theme: {
        dark: 'Dark',
        label: 'Theme',
        light: 'Light',
        system: 'System',
      },
      preferences: {
        label: 'Preferences',
      },
      builder: {
        examples: {
          defaultBadge: 'Default',
          descriptionEnd: 'when the template opens.',
          descriptionStart: 'Each example becomes a valid',
          empty: 'No records found.',
          loadError: 'Could not load records.',
          loading: 'Loading records...',
          needsStartModel: 'Add a start model in step 1 first.',
          openActions: 'Open actions for {{example}}',
          pickerDescription:
            'Search for a {{model}} record to pin as an example.',
          pickerSearch: 'Search records...',
          pickerTitle: 'Pick example record',
          pinRecord: '+ Pin example record',
          removeRecord: 'Remove',
          previewBadge: 'Preview',
          setDefault: 'Set as default',
          startingRecord: 'starting record',
        },
        grouping: {
          addRule: 'Add grouping rule',
          description:
            'Click a relationship to cycle its display mode: Tree → Group → Breakout.',
          empty:
            'No grouping rules.',
          hint: 'Group: children render inside the parent node. Breakout: node escapes its parent group.',
          mode_breakout: 'Breakout',
          mode_group: 'Group',
          mode_none: 'Tree',
          noEdges: 'Define traversal relationships in step 2 first.',
          removeRule: 'Remove rule',
        },
        filters: {
          addFilter: 'Add',
          description:
            'QLab filters for individual models. Preview and execution use the same validated filter shape.',
          empty: 'No filters yet.',
          fieldLabel: 'Field',
          metadataError: 'Could not load QLab fields.',
          modelLabel: 'Model',
          operatorLabel: 'Operator',
          removeFilter: 'Remove filter',
          suggestedBadge: 'suggested',
          valueLabel: 'Value',
        },
        header: {
          back: 'Back',
          loadingRecords: 'Loading records…',
          noRecordsFound: 'No records found.',
          pinnedRecords: 'Pinned records',
          preview: 'Preview',
          previewPickerDescription:
            'Pick a {{model}} record for live preview.',
          previewPickerSearch: 'Search records…',
          previewPickerTitle: 'Preview record',
          promote: 'Promote',
          save: 'Save',
          titleLabel: 'Template title',
          titlePlaceholder: 'Untitled template',
        },
        inspector: {
          next: 'Next',
          prev: 'Prev',
          stepProgress: 'Step {{current}} of {{total}}',
        },
        layerManager: {
          add: 'Add layer',
          description: 'Add or remove layers from the generation template.',
          empty: 'No layers found.',
          group: 'Layers',
          modelCount: '{{count}} models',
          modelCount_one: '{{count}} model',
          modelCount_other: '{{count}} models',
          search: 'Search layers...',
          title: 'Manage layers',
        },
        layout: {
          selected: 'selected',
        },
        modelPicker: {
          description:
            'Search for a Django model to add to your generation template.',
          empty: 'No models found.',
          search: 'Search models...',
          title: 'Add model',
        },
        models: {
          addLayer: 'Add layer',
          addModel: 'Add model',
          addModelToLayer: 'Add model to {{layer}}',
          addStartModel: 'Add start model',
          empty: 'No models added yet. Click to add one.',
          groupModelCount: '{{count}}',
          groupModelCount_one: '{{count}}',
          groupModelCount_other: '{{count}}',
          layerActions: 'Actions for {{layer}}',
          layerPlaceholder: 'Layer',
          layerSelectLabel: 'Layer for {{model}}',
          layerSummary: 'layers',
          layerSummary_one: 'layer',
          layerSummary_other: 'layers',
          layers: 'Layers',
          loadError: 'Could not load backend models.',
          loading: 'Loading models...',
          modelSummary: 'models',
          modelSummary_one: 'model',
          modelSummary_other: 'models',
          removeLayer: 'Remove {{layer}}',
          removeModel: 'Remove {{model}}',
          reorderModel: 'Reorder {{model}}',
          startBadge: 'Start',
          startLayerHint:
            'Only one start point. Drop more models into layer 2+.',
          startLayerTitle: 'Start point',
          startModelSummary: '{{model}} as start',
        },
        preview: {
          edgeCount: '{{count}} edges',
          edgeCount_one: '{{count}} edge',
          edgeCount_other: '{{count}} edges',
          layerAndEdgeCount: '{{layers}} · {{edges}}',
          layerCount: '{{count}} layers',
          layerCount_one: '{{count}} layer',
          layerCount_other: '{{count}} layers',
          recheck: 'Recheck',
          resolveError: 'Could not resolve preview.',
          resolvedFor: 'Resolved for {{record}}',
          resolving: 'Resolving...',
          retry: 'Retry',
          title: 'Preview',
        },
        promote: {
          audienceLabel: 'Audience: {{audience}}',
          empty:
            'Configure promotion settings to share this template with your org.',
          orgLabel: 'Org: {{org}}',
          visibilityLabel: 'Visibility: {{visibility}}',
        },
        sidebar: {
          stepCount: '{{count}} steps',
          stepCount_one: '{{count}} step',
          stepCount_other: '{{count}} steps',
          title: 'Recipe',
        },
        steps: {
          layers: {
            title: 'Choose models',
            detail:
              'Add backend models and assign them to shared visual layers. Layer 1 contains exactly one model - the start point.',
          },
          traversal: {
            title: 'Traversal & pathfinding',
            detail:
              'How does the recipe walk from a start to each layer? Auto-pathfind where unambiguous; pick when there are multiple paths.',
          },
          examples: {
            title: 'Example records',
            detail: 'Test a real record for each starting point',
          },
          filters: {
            title: 'Filters',
            detail:
              'Narrow what enters each layer. Django-style queries, per starting record.',
          },
          grouping: {
            title: 'Grouping',
            detail:
              'Parent-child containment. A model is drawn as a container around its children.',
          },
          style: {
            title: 'Style each layer',
            detail: 'Color, shape, density — applied per layer.',
          },
          layout: {
            title: 'Choose layout',
            detail: 'Layout algorithms — layered, tree, force, radial.',
          },
          promote: {
            title: 'Promote',
            detail:
              'Publish this recipe to your org — others see your landscape.',
          },
        },
        traversal: {
          addWaypoint: 'Add waypoint',
          ambiguousEdges: '{{count}} ambiguous edge - pick the path you want.',
          ambiguousEdges_one:
            '{{count}} ambiguous edge - pick the path you want.',
          ambiguousEdges_other:
            '{{count}} ambiguous edges - pick the path you want.',
          autoBadge: 'auto',
          changeRoute: 'Change route',
          costTitle: 'cost {{cost}}',
          description:
            "Auto-pathfinding walks the schema graph. When multiple paths exist, pick one.",
          dialogDescription:
            'Pick a route for {{from}} → {{to}}',
          dialogTitle: 'Pick route',
          directGroup: 'Direct (1 hop)',
          findingRoutes: 'Finding routes...',
          hopsGroup: '{{count}} hops',
          manyHopsGroup: '{{count}}+ hops',
          needsModels:
            'Add at least two models on different layers to discover paths.',
          needsPickBadge: 'needs pick',
          noRouteFound: 'No route found between these models.',
          pickRoute: 'Pick route',
          routeError: 'Could not load routes.',
          sameLayerHint:
            'All models are on the same layer. Spread them across layers to discover paths.',
          searchRoutes: 'Search routes...',
          viaWaypoints: 'via {{waypoints}}',
        },
      },
    },
  },
} as const
