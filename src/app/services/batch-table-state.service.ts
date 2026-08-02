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
import { Product } from '../models/product';

@Injectable({ providedIn: 'root' })
export class BatchTableStateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly transferState = inject(TransferState);
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

    if (this.first() === 0 && drafts.length) {
      return [...drafts, ...page];
    }

    return page;
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

  setPageData(products: Product[], totalRecords: number, first: number): void {
    this.products.set(products);
    this.totalRecords.set(totalRecords);
    this.first.set(first);
    this.loading.set(false);
  }

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

  updateCellValue(
    product: Product,
    field: keyof Product,
    value: unknown,
  ): void {
    if (field === '_original' || field === '_isNew' || field === '_tempId') {
      return;
    }

    const key = this.keyOf(product, field as string);
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

  discardAll(): void {
    this.resetTracking();
  }

  undoCell(
    product: Product,
    field: keyof Omit<Product, '_isNew' | '_original' | '_tempId'>,
  ): void {
    if (!product._original) {
      return;
    }

    const originalValue = product._original[field];
    (product as unknown as Record<string, unknown>)[field] = originalValue;
    const key = this.keyOf(product, field as string);

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

  undoRow(product: Product): void {
    if (!product._original) {
      return;
    }

    const fields: Array<
      keyof Omit<Product, '_isNew' | '_original' | '_tempId'>
    > = ['code', 'name', 'category', 'quantity', 'price'];
    fields.forEach((field) => {
      (product as unknown as Record<string, unknown>)[field] =
        product._original![field];
    });

    const id = this.keyOf(product);
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

  getAllServerData(): Product[] {
    return this.allServerData();
  }

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

  private resetTracking(): void {
    this.pendingFieldValues.set(new Map());
    this.pendingNewRows.set([]);
    this.dirtyKeys.set(new Set());
  }

  private keyOf(product: Product, field?: string): string {
    const id =
      product.id != null ? String(product.id) : `temp-${product._tempId}`;
    return field ? `${id}::${field}` : id;
  }

  /** Returns an error message or null for a field of a new row */
  getFieldError(product: Product, field: any): string | null {
    // if (!product._isNew) return null;

    const raw = (product as any)[field];
    const value = raw == null ? '' : String(raw).trim();

    switch (field) {
      case 'code':
        if (!value) return 'کد را وارد کنید';
        break;
      case 'name':
        if (!value) return 'نام را وارد کنید';
        break;
      case 'quantity':
        if (value === '') return 'تعداد الزامی است'; // or keep optional if you prefer
        if (isNaN(Number(value)) || Number(value) < 0) return 'Must be ≥ 0';
        break;
      case 'price':
        if (value === '') return 'قیمت را وارد کنید'; // or keep optional
        if (isNaN(Number(value)) || Number(value) < 0) return 'Must be ≥ 0';
        break;
    }
    return null;
  }

  /** True when the given product has no validation errors */
  isRowValid(product: Product): boolean {
    return (
      !this.getFieldError(product, 'code') &&
      !this.getFieldError(product, 'name') &&
      !this.getFieldError(product, 'quantity') &&
      !this.getFieldError(product, 'price')
    );
  }

  /** True if any visible row (new or existing) is invalid */
  hasAnyInvalidRow(): boolean {
    return this.tableValue().some((p) => !this.isRowValid(p));
  }

  /** Keep the old name as an alias if you still use it in the template */
  hasAnyInvalidNewRow(): boolean {
    return this.tableValue().some((p) => p._isNew && !this.isRowValid(p));
  }

  /** Force change detection so error messages update while typing */
  onNewRowFieldChange(product: Product): void {
    if (product._isNew) {
      this.products.update((list) => [...list]);
      this.pendingNewRows.update((list) => [...list]);
    }
  }

  /** Mark a single field as touched (new rows only) */
  markFieldTouched(product: Product, field: string): void {
    if (!(product as any)._touched) {
      (product as any)._touched = {};
    }
    (product as any)._touched[field] = true;

    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  isFieldTouched(product: Product, field: string): boolean {
    return !!(product as any)._touched?.[field];
  }

  /** Mark every field of every row as touched */
  markAllRowsTouched(): void {
    this.tableValue().forEach((p) => {
      if (!(p as any)._touched) {
        (p as any)._touched = {};
      }
      ['code', 'name', 'category', 'quantity', 'price'].forEach((f) => {
        (p as any)._touched[f] = true;
      });
    });

    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  /** Mark every field of every new row as touched */
  markAllNewRowsTouched(): void {
    this.tableValue().forEach((p) => {
      if (!p._isNew) return;
      if (!(p as any)._touched) {
        (p as any)._touched = {};
      }
      ['code', 'name', 'category', 'quantity', 'price'].forEach((f) => {
        (p as any)._touched[f] = true;
      });
    });

    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }
}
