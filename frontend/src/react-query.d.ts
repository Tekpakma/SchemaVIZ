import '@tanstack/react-query'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Shown as a success toast when the mutation succeeds. */
      successMessage?: string
      /** Shown as an error toast when the mutation fails (falls back to error.message). */
      errorMessage?: string
    }
  }
}
