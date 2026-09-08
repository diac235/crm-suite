import { useCallback, useMemo, useState } from 'react';
import { useDebounced } from './useDebounced';

export interface TableState {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  search: string;
  filters: Record<string, string | undefined>;
}

/** Estado compartido de las tablas: búsqueda, orden, filtros y paginación. */
export function useTableState(initial?: Partial<TableState>) {
  const [state, setState] = useState<TableState>({
    page: 1,
    pageSize: 25,
    sortDir: 'desc',
    search: '',
    filters: {},
    ...initial,
  });

  const debouncedSearch = useDebounced(state.search);

  const setSearch = useCallback((search: string) => {
    setState((s) => ({ ...s, search, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => setState((s) => ({ ...s, page })), []);

  const setPageSize = useCallback(
    (pageSize: number) => setState((s) => ({ ...s, pageSize, page: 1 })),
    [],
  );

  const setFilter = useCallback((key: string, value: string | undefined) => {
    setState((s) => ({ ...s, filters: { ...s.filters, [key]: value || undefined }, page: 1 }));
  }, []);

  const resetFilters = useCallback(() => {
    setState((s) => ({ ...s, filters: {}, search: '', page: 1 }));
  }, []);

  const toggleSort = useCallback((column: string) => {
    setState((s) => ({
      ...s,
      sortBy: column,
      sortDir: s.sortBy === column && s.sortDir === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  }, []);

  const queryParams = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      search: debouncedSearch || undefined,
      ...Object.fromEntries(Object.entries(state.filters).filter(([, v]) => v !== undefined)),
    }),
    [state, debouncedSearch],
  );

  const activeFilterCount = useMemo(
    () => Object.values(state.filters).filter(Boolean).length,
    [state.filters],
  );

  return {
    state,
    queryParams,
    activeFilterCount,
    setSearch,
    setPage,
    setPageSize,
    setFilter,
    resetFilters,
    toggleSort,
  };
}
