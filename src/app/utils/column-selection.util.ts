import { TableColumnDefinition } from '../models/table-column-definition';

export function resolveSelectedColumns(
  allColumns: TableColumnDefinition[],
  savedColumns: TableColumnDefinition[] | null,
): TableColumnDefinition[] {
  if (!savedColumns?.length) {
    return [...allColumns];
  }

  const byField = new Map(allColumns.map((column) => [column.field, column]));
  const restored = (savedColumns || [])
    .map((column) => byField.get(column.field))
    .filter((column): column is TableColumnDefinition => !!column);

  return restored.length > 0 ? restored : [...allColumns];
}

export function reconcileSelectedColumns(
  previousSelection: TableColumnDefinition[],
  nextSelection: TableColumnDefinition[],
): TableColumnDefinition[] {
  if (!nextSelection?.length) {
    return [...previousSelection];
  }

  const selectedFields = new Set(nextSelection.map((column) => column.field));
  const kept = previousSelection.filter((column) =>
    selectedFields.has(column.field),
  );
  const keptFields = new Set(kept.map((column) => column.field));
  const added = nextSelection.filter((column) => !keptFields.has(column.field));

  return [...kept, ...added];
}
