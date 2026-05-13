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
        steps: {
          layers: {
            title: 'Ebenen definieren',
            detail: 'Welche Art von Entitäten zeigt dieses Diagramm? Geschäftsgruppen → Dienste → Compute → Daten.',
          },
          traversal: {
            title: 'Traversierung & Wegfindung',
            detail: 'Wie verläuft das Rezept von einem Startpunkt zu jeder Ebene? Automatische Wegfindung, wo eindeutig; ansonsten manuell auswählen.',
          },
          examples: {
            title: 'Beispieldatensätze',
            detail: 'Einen echten Datensatz für jeden Startpunkt testen.',
          },
          filters: {
            title: 'Filter',
            detail: 'Einschränken, was in jede Ebene gelangt. Django-artige Abfragen, pro Startdatensatz.',
          },
          style: {
            title: 'Ebenen gestalten',
            detail: 'Farbe, Form, Dichte — pro Ebene angewendet.',
          },
          layout: {
            title: 'Layout wählen',
            detail: 'Layout-Algorithmen — geschichtet, Baum, kräftebasiert, radial.',
          },
          promote: {
            title: 'Veröffentlichen',
            detail: 'Dieses Rezept in Ihrer Organisation veröffentlichen — andere sehen Ihre Landschaft.',
          },
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
        steps: {
          layers: {
            title: 'Define layers',
            detail: 'What kinds of entities does this diagram show? Business groups → Services → Compute → Data.',
          },
          traversal: {
            title: 'Traversal & pathfinding',
            detail: 'How does the recipe walk from a start to each layer? Auto-pathfind where unambiguous; pick when there are multiple paths.',
          },
          examples: {
            title: 'Example records',
            detail: 'Test a real record for each starting point',
          },
          filters: {
            title: 'Filters',
            detail: 'Narrow what enters each layer. Django-style queries, per starting record.',
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
            detail: 'Publish this recipe to your org — others see your landscape.',
          },
        },
      },
    },
  },
} as const
