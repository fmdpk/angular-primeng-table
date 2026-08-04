import {
  computed,
  inject,
  Injectable,
  makeStateKey,
  PLATFORM_ID,
  signal,
  TransferState,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BatchTableValidationService } from './batch-table-validation.service';
import { buildRowKey } from '../utils/table-key.util';
import { Product, ProductCore } from '../models/product';

@Injectable({ providedIn: 'root' })
export class BatchTableStateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly transferState = inject(TransferState);
  private readonly validationService = inject(BatchTableValidationService);
  private readonly dataKey = makeStateKey<Product[]>('batch-table-all-data');

  readonly isBrowser = isPlatformBrowser(this.platformId);
  rows = 5;

  readonly products = signal<Product[]>([]);
  readonly pendingFieldValues = signal<Map<string, unknown>>(new Map());
  readonly pendingNewRows = signal<Product[]>([]);
  readonly dirtyKeys = signal<Set<string>>(new Set());
  readonly totalRecords = signal(0);
  readonly first = signal(0);
  readonly loading = signal(false);

  readonly addedCount = computed(() => this.pendingNewRows().length);
  readonly editedCount = computed(() => {
    const ids = new Set(
      Array.from(this.dirtyKeys())
        .filter((key) => !key.startsWith('temp-'))
        .map((key) => key.split('::')[0]),
    );

    return ids.size;
  });
  readonly totalPendingCount = computed(
    () => this.editedCount() + this.addedCount(),
  );

  readonly tableValue = computed(() => {
    const page = this.products();
    const drafts = this.pendingNewRows().filter(
      (row) => row._isNew && !!row._tempId,
    );

    return this.first() === 0 && drafts.length ? [...drafts, ...page] : page;
  });

  readonly totalQuantity = computed(() =>
    this.tableValue().reduce(
      (sum, row) => sum + (Number(row.quantity) || 0),
      0,
    ),
  );

  readonly totalPrice = computed(() =>
    this.tableValue().reduce((sum, row) => sum + (Number(row.price) || 0), 0),
  );

  private readonly allServerData = signal<Product[]>([]);

  /**
   * Initializes the service data and resets pending edit tracking.
   */
  initializeData(): void {
    if (this.transferState.hasKey(this.dataKey)) {
      this.allServerData.set(this.transferState.get(this.dataKey, []));
      this.transferState.remove(this.dataKey);
    } else {
      const data: Product[] = Array.from({ length: 23 }, (_, index) => ({
        id: index + 1,
        code: `P${String(index + 1).padStart(3, '0')}`,
        name: `محصول ${index + 1}`,
        category: index % 2 === 0 ? 'دسته 1' : 'دسته 2',
        quantity: (index + 1) * 3,
        price: 20 + index * 5,
      }));

      this.allServerData.set(data);

      if (!this.isBrowser) {
        this.transferState.set(this.dataKey, data);
      }
    }

    this.pendingNewRows.set([]);
    this.pendingFieldValues.set(new Map());
    this.dirtyKeys.set(new Set());
  }

  /**
   * Stores the current page of products and paging metadata.
   */
  setPageData(products: Product[], totalRecords: number, first: number): void {
    this.products.set(products);
    this.totalRecords.set(totalRecords);
    this.first.set(first);
    this.loading.set(false);
  }

  /**
   * Merges pending field values into a row before it is displayed.
   */
  mergePending(serverRow: Product): Product {
    const row: Product = {
      ...serverRow,
      _original: {
        id: serverRow.id,
        code: serverRow.code,
        name: serverRow.name,
        category: serverRow.category,
        quantity: serverRow.quantity,
        price: serverRow.price,
      },
    };

    const id = String(serverRow.id);
    this.pendingFieldValues().forEach((value, key) => {
      if (key.startsWith(`${id}::`)) {
        const field = key.split('::')[1] as keyof Product;
        (row as unknown as Record<string, unknown>)[field] = value;
      }
    });

    return row;
  }

  /**
   * Tracks a cell-level change and updates the dirty state.
   */
  updateCellValue(
    product: Product,
    field: keyof Product,
    value: unknown,
  ): void {
    if (field === '_original' || field === '_isNew' || field === '_tempId') {
      return;
    }

    const key = buildRowKey(product, field as string);
    const original =
      product._original?.[field as keyof NonNullable<Product['_original']>];
    const current = value;

    this.pendingFieldValues.update((map) => {
      const next = new Map(map);
      if (current !== original) {
        next.set(key, current);
      } else {
        next.delete(key);
      }
      return next;
    });

    this.dirtyKeys.update((set) => {
      const next = new Set(set);
      if (current !== original) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  /**
   * Creates a new draft row for the table.
   */
  startAddRow(): Product {
    const draft: Product = {
      code: '',
      name: '',
      category: '',
      quantity: 1,
      price: 1,
      _isNew: true,
      _tempId: crypto.randomUUID(),
      _original: {
        code: '',
        name: '',
        category: '',
        quantity: 1,
        price: 1,
      },
    };

    this.pendingNewRows.update((rows) => [draft, ...rows]);
    return draft;
  }

  /**
   * Saves all pending edits and newly added rows.
   */
  saveBatch(): { updates: Product[]; creates: Product[] } {
    const editedById = new Map<number, Product>();

    this.pendingFieldValues().forEach((value, key) => {
      if (key.startsWith('temp-')) {
        return;
      }

      const [idStr, field] = key.split('::');
      const id = Number(idStr);
      if (!id || !field) {
        return;
      }

      let row = editedById.get(id);
      if (!row) {
        const serverRow = this.allServerData().find((item) => item.id === id);
        if (!serverRow) {
          return;
        }
        row = { ...serverRow };
        editedById.set(id, row);
      }

      (row as unknown as Record<string, unknown>)[field] = value;
    });

    const editedRows = Array.from(editedById.values());
    const newRows = this.filterPendingNewRows();

    this.allServerData.update((all) => {
      const next = all.map((row) => {
        const updated = { ...row };
        this.pendingFieldValues().forEach((value, key) => {
          if (key.startsWith(`${row.id}::`)) {
            const field = key.split('::')[1] as keyof Product;
            (updated as unknown as Record<string, unknown>)[field] = value;
          }
        });
        return updated;
      });

      if (editedRows.length) {
        const byId = new Map(editedRows.map((row) => [row.id, row]));
        return next.map((row) =>
          byId.has(row.id!) ? { ...byId.get(row.id!)! } : row,
        );
      }

      return next;
    });

    if (newRows.length) {
      this.allServerData.update((all) => [...newRows, ...all]);
    }

    this.resetTracking();

    return {
      updates: editedRows,
      creates: newRows,
    };
  }

  /**
   * Discards all pending edits and resets the tracking state.
   */
  discardAll(): void {
    this.resetTracking();
  }

  /**
   * Reverts a single edited cell to its original value.
   */
  undoCell(product: Product, field: keyof Product): void {
    if (!product._original) {
      return;
    }

    const originalValue = product._original[
      field as keyof ProductCore
    ] as Product[keyof Product];
    (product as unknown as Record<string, unknown>)[field as string] =
      originalValue;
    const key = buildRowKey(product, field as string);

    this.pendingFieldValues.update((map) => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });

    this.dirtyKeys.update((set) => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });
  }

  /**
   * Reverts all edits for a row to their original values.
   */
  undoRow(product: Product): void {
    if (!product._original) {
      return;
    }

    const fields: Array<keyof Product> = [
      'code',
      'name',
      'category',
      'quantity',
      'price',
    ];
    fields.forEach((field) => {
      (product as unknown as Record<string, unknown>)[field as string] =
        product._original![field as keyof ProductCore];
    });

    const id = buildRowKey(product);
    this.dirtyKeys.update((set) => {
      const next = new Set(set);
      [...next].forEach((key) => {
        if (key.startsWith(id + '::')) {
          next.delete(key);
        }
      });
      return next;
    });
  }

  /**
   * Removes a newly added draft row from the pending state.
   */
  deleteNewRow(product: Product): void {
    if (!product._isNew || !product._tempId) {
      return;
    }

    this.pendingNewRows.update((rows) =>
      rows.filter((row) => row._tempId !== product._tempId),
    );

    const id = `temp-${product._tempId}`;
    this.dirtyKeys.update((set) => {
      const next = new Set(set);
      [...next].forEach((key) => {
        if (key.startsWith(id + '::') || key === id) {
          next.delete(key);
        }
      });
      return next;
    });

    this.pendingFieldValues.update((map) => {
      const next = new Map(map);
      [...next.keys()].forEach((key) => {
        if (key.startsWith(id + '::')) {
          next.delete(key);
        }
      });
      return next;
    });
  }

  /**
   * Builds a summary of the current pending changes for the user.
   */
  pendingMessage(): string {
    const edited = this.editedCount();
    const added = this.addedCount();

    if (edited > 0 && added > 0) {
      return `شما ${edited} تغییر دارید و ${added} سطر اضاف کردید`;
    }
    if (edited > 0) {
      return `شما ${edited} تغییر ذخیره نشده دارید`;
    }
    return `شما ${added} سطر اضفه کردید که ذخیره نشده است`;
  }

  /**
   * Returns the display label for a column field.
   */
  columnLabel(field: string): string {
    const map: Record<string, string> = {
      code: 'Code',
      name: 'Name',
      category: 'Category',
      quantity: 'Quantity',
      price: 'Price',
    };

    return map[field] ?? field;
  }

  /**
   * Returns the full set of server data loaded into the service.
   */
  getAllServerData(): Product[] {
    return this.allServerData();
  }

  /**
   * Returns the validation error message for a field on a product.
   */
  getFieldError(product: Product, field: keyof Product): string | null {
    return this.validationService.getFieldError(
      product,
      field as keyof ProductCore,
    );
  }

  /**
   * Determines whether a product row passes validation.
   */
  isRowValid(product: Product): boolean {
    return this.validationService.isRowValid(product);
  }

  /**
   * Checks whether any row in the current view is invalid.
   */
  hasAnyInvalidRow(): boolean {
    return this.validationService.hasAnyInvalid(this.tableValue());
  }

  /**
   * Checks whether any newly added row is invalid.
   */
  hasAnyInvalidNewRow(): boolean {
    return this.validationService.hasAnyInvalidNew(this.tableValue());
  }

  /**
   * Refreshes the state after a draft row field changes.
   */
  onNewRowFieldChange(product: Product): void {
    if (product._isNew) {
      this.products.update((list) => [...list]);
      this.pendingNewRows.update((list) => [...list]);
    }
  }

  /**
   * Marks a field as touched for validation feedback.
   */
  markFieldTouched(product: Product, field: keyof Product): void {
    this.validationService.markFieldTouched(
      product,
      field as keyof ProductCore,
    );
    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  /**
   * Returns whether a field has been marked as touched.
   */
  isFieldTouched(product: Product, field: keyof Product): boolean {
    return this.validationService.isFieldTouched(
      product,
      field as keyof ProductCore,
    );
  }

  /**
   * Marks every visible row as touched for validation display.
   */
  markAllRowsTouched(): void {
    this.validationService.markAllTouched(this.tableValue());
    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  /**
   * Marks every new row as touched for validation display.
   */
  markAllNewRowsTouched(): void {
    this.validationService.markAllNewTouched(this.tableValue());
    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  /**
   * Returns whether the provided cell is marked as dirty.
   */
  isCellDirty(product: Product, field: string): boolean {
    const key = buildRowKey(product, field);
    return this.dirtyKeys().has(key);
  }

  /**
   * Returns whether the provided row has any pending dirty fields.
   */
  isDirty(product: Product): boolean {
    if (product._isNew) return true;
    const id = buildRowKey(product);
    return Array.from(this.dirtyKeys()).some((key) =>
      key.startsWith(id + '::'),
    );
  }

  /**
   * Resets the visible row count to the configured page size.
   */
  resetRows(): void {
    this.totalRecords.set(this.rows);
  }

  /**
   * Filters and normalizes the pending rows that should be created on save.
   */
  private filterPendingNewRows(): Product[] {
    const newItems = this.pendingNewRows()
      .filter(
        (item) =>
          item._isNew && (!!item.code || !!item.name || !!item.category),
      )
      .map((item, index) => {
        const { _isNew, _tempId, _original, ...core } = item;
        return {
          ...core,
          id: this.allServerData().length + index + 1,
        } as Product;
      });

    this.pendingNewRows.set(newItems);
    return newItems;
  }

  /**
   * Clears the pending edit and draft tracking state.
   */
  private resetTracking(): void {
    this.pendingFieldValues.set(new Map());
    this.pendingNewRows.set([]);
    this.dirtyKeys.set(new Set());
  }
}
