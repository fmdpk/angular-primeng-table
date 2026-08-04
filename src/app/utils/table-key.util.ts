export function buildRowKey(
  product: { id?: number; _tempId?: string },
  field?: string,
): string {
  const id =
    product.id != null ? String(product.id) : `temp-${product._tempId}`;
  return field ? `${id}::${field}` : id;
}
