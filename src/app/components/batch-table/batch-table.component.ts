import {Component, computed, inject, makeStateKey, OnInit, PLATFORM_ID, signal, TransferState} from '@angular/core';
import {TableEditCompleteEvent, TableLazyLoadEvent, TableModule} from 'primeng/table';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {ButtonModule} from 'primeng/button';
import {ConfirmDialogModule} from 'primeng/confirmdialog';
import {ConfirmationService, MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {FormsModule} from '@angular/forms';
import {CommonModule, isPlatformBrowser} from '@angular/common';
import {Product} from '../../models/product';
import {TooltipModule} from 'primeng/tooltip';

@Component({
  selector: 'app-batch-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    ConfirmDialogModule,
    ToastModule,
    TooltipModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './batch-table.component.html',
  styleUrl: './batch-table.component.scss'
})
export class BatchTableComponent implements OnInit {
  products = signal<Product[]>([]);
  draftRow = signal<Product | null>(null);         // the temporary new row
  // ---- current page from "API" ----
  totalRecords = signal(0);
  first = signal(0);
  rows = 5; // page size
  loading = signal(false);
  // ---- change tracking (survives pagination) ----
  /** key = `${id}::${field}` → edited value */
  pendingFieldValues = signal<Map<string, unknown>>(new Map());
  pendingNewRows = signal<Product[]>([]);
  /** Rows that were added and not yet saved */
  addedCount = computed(() => this.pendingNewRows().length);
  hasDraftRow = computed(() =>
    this.pendingNewRows().some(p => p._isNew && !!p._tempId)
  );
  dirtyKeys = signal<Set<string>>(new Set());
  // ---- display: new rows on top of page 1 only (extra rows, not replacing) ----
  tableValue = computed(() => {
    const page = this.products(); // P001–P005 on page 1
    const drafts = this.pendingNewRows().filter(p => p._isNew && !!p._tempId);

    if (this.first() === 0 && drafts.length) {
      return [...drafts, ...page]; // 6 items → all must be visible
    }
    return page;
  });
  totalQuantity = computed(() =>
    this.tableValue().reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
  );
  totalPrice = computed(() =>
    this.tableValue().reduce((sum, p) => sum + (Number(p.price) || 0), 0)
  );
  /** Existing rows that have at least one dirty cell (excludes new rows) */
  editedCount = computed(() => {
    const ids = new Set(
      Array.from(this.dirtyKeys())
        .filter(k => !k.startsWith('temp-'))
        .map(k => k.split('::')[0])
    );
    return ids.size;
  });
  /** Total (optional – useful for enabling Save) */

  totalPendingCount = computed(() => this.editedCount() + this.addedCount());
  // ---- simulated DB ----
  private allServerData = signal<Product[]>([]);

  platformId = inject(PLATFORM_ID);
  transferState = inject(TransferState);

  DATA_KEY = makeStateKey<Product[]>('batch-table-all-data');
  readonly isBrowser = isPlatformBrowser(this.platformId);


  constructor(
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) {

  }

  ngOnInit() {
    // Seed simulated DB once (SSR-safe)
    if (this.transferState.hasKey(this.DATA_KEY)) {
      this.allServerData.set(this.transferState.get(this.DATA_KEY, []));
      this.transferState.remove(this.DATA_KEY);
    } else {
      const data: Product[] = Array.from({length: 23}, (_, i) => ({
        id: i + 1,
        code: `P${String(i + 1).padStart(3, '0')}`,
        name: `Product ${i + 1}`,
        category: i % 2 === 0 ? 'Accessories' : 'Fitness',
        quantity: (i + 1) * 3,
        price: 20 + i * 5
      }));
      this.allServerData.set(data);

      if (!this.isBrowser) {
        this.transferState.set(this.DATA_KEY, data);
      }
    }
    this.pendingNewRows.set([]);
    this.pendingFieldValues.set(new Map());
    this.dirtyKeys.set(new Set());
    // this.loadPage({first: 0, rows: this.rows});
  }

  // ---------- Simulated API ----------
  loadPage(event: TableLazyLoadEvent): void {
    // Avoid running the “API” on the server; client onLazyLoad will load data
    if (!this.isBrowser) {
      return;
    }

    const first = event.first ?? 0;
    const rows = event.rows ?? this.rows;

    console.log('loadPage', {first, rows});

    this.first.set(first);
    this.loading.set(true);

    window.setTimeout(() => {
      // Always REPLACE the page – never append
      const slice = this.allServerData()
        .slice(first, first + rows)
        .map(p => this.mergePending({...p}));

      this.products.set(slice);          // exactly `rows` server rows
      this.totalRecords.set(this.allServerData().length); // do NOT add draft count
      this.loading.set(false);

      // Debug: should be only current page codes
      console.log(
        'page products',
        this.products().map(p => p.code),
        'drafts',
        this.pendingNewRows().map(p => p.code),
        'tableValue',
        this.tableValue().map(p => p.code)
      );
    }, 500);
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
        price: serverRow.price
      }
    };

    const id = String(serverRow.id);
    this.pendingFieldValues().forEach((value, key) => {
      if (key.startsWith(`${id}::`)) {
        const field = key.split('::')[1] as keyof Product;
        (row as any)[field] = value;
      }
    });

    return row;
  }

  // ---------- Replace dirty helpers ----------
  isCellDirty(product: Product, field: keyof Product): boolean {
    return this.dirtyKeys().has(this.keyOf(product, field as string));
  }

  isDirty(product: Product): boolean {
    if (product._isNew) return true;
    const id = this.keyOf(product);
    return Array.from(this.dirtyKeys()).some(k => k.startsWith(id + '::'));
  }

  // call this whenever a cell finishes editing
  onCellEditComplete(event: TableEditCompleteEvent): void {
    const product = event.data as Product | undefined;
    const field = event.field as keyof Product | undefined;
    if (!product || !field) return;
    if (field === '_original' || field === '_isNew' || field === '_tempId') return;

    const key = this.keyOf(product, field as string);
    const original = product._original?.[field as keyof NonNullable<Product['_original']>];
    const current = product[field];

    // persist edit outside the page array
    this.pendingFieldValues.update(map => {
      const next = new Map(map);
      if (current !== original) {
        next.set(key, current);
      } else {
        next.delete(key);
      }
      return next;
    });

    this.dirtyKeys.update(set => {
      const next = new Set(set);
      if (current !== original) next.add(key);
      else next.delete(key);
      return next;
    });

    // refresh current page reference (totals / UI)
    this.products.update(list => [...list]);
    this.pendingNewRows.update(list => [...list]);
  }

  // ---------- Add row (extra row on page 1, does not drop last row) ----------
  startAddRow(): void {
    if (this.hasDraftRow()) return;

    // show page 1 so the draft is visible under the header
    if (this.first() !== 0) {
      this.loadPage({first: 0, rows: this.rows});
    }

    const draft: Product = {
      code: '',
      name: '',
      category: '',
      quantity: 0,
      price: 0,
      _isNew: true,
      _tempId: crypto.randomUUID(),
      _original: {
        code: '',
        name: '',
        category: '',
        quantity: 0,
        price: 0
      }
    };

    // DO NOT touch allServerData or products here
    this.pendingNewRows.update(list => [draft, ...list]);

    console.log({
      products: this.products().map(p => p.code),      // ['P001',…,'P005']
      drafts: this.pendingNewRows().map(p => p._tempId),
      tableValue: this.tableValue().map(p => p.code || 'DRAFT'),
      length: this.tableValue().length                 // should be 6
    });
  }

  confirmAddRow(): void {
    const draft = this.draftRow();
    if (!draft) return;

    if (!draft.code?.trim() || !draft.name?.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Validation',
        detail: 'Code and Name are required'
      });
      return;
    }

    const newProduct: Product = {
      ...draft,
      _tempId: crypto.randomUUID(),
      _isNew: true,
      _original: {
        code: draft.code,
        name: draft.name,
        category: draft.category,
        quantity: draft.quantity,
        price: draft.price
      }
    };

    this.products.update(list => [newProduct, ...list]);
    this.draftRow.set(null);
  }

  cancelAddRow(): void {
    this.draftRow.set(null);
  }

  // ---------- Batch save → simulate API, then reset tracking ----------
  saveBatch(): void {
    if (this.totalPendingCount() === 0) return;

    this.confirmationService.confirm({
      message: `Save ${this.editedCount()} change(s) and ${this.addedCount()} added row(s)?`,
      header: 'Batch Update',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        // 1) apply edits onto simulated DB
        this.allServerData.update(all =>
          all.map(row => {
            const id = String(row.id);
            const updated = {...row};
            this.pendingFieldValues().forEach((value, key) => {
              if (key.startsWith(`${id}::`)) {
                const field = key.split('::')[1];
                (updated as any)[field] = value;
              }
            });
            return updated;
          })
        );

        // 2) append new rows to simulated DB
        const news = this.pendingNewRows().map((p, i) => {
          const {_isNew, _tempId, _original, ...core} = p;
          return {
            ...core,
            id: this.allServerData().length + i + 1
          } as Product;
        });
        if (news.length) {
          this.allServerData.update(all => [...news, ...all]);
        }

        // 3) reset ALL tracking
        this.pendingFieldValues.set(new Map());
        this.pendingNewRows.set([]);
        this.dirtyKeys.set(new Set());

        // 4) reload current page from "API"
        this.loadPage({first: this.first(), rows: this.rows});

        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Batch update completed'
        });
      }
    });
  }

  // optional: discard all changes
  discardAll(): void {
    this.pendingFieldValues.set(new Map());
    this.pendingNewRows.set([]);
    this.dirtyKeys.set(new Set());
    this.loadPage({first: this.first(), rows: this.rows});
  }

  undoCell(
    product: Product,
    field: keyof Omit<Product, '_isNew' | '_original' | '_tempId'>
  ): void {
    if (!product._original) return;

    const originalValue = product._original[field];
    (product as any)[field] = originalValue;

    const key = this.keyOf(product, field as string);

    this.pendingFieldValues.update(map => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });

    this.dirtyKeys.update(set => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });

    this.products.update(list => [...list]);
    this.pendingNewRows.update(list => [...list]);
  }

  undoRow(product: Product): void {
    if (!product._original) return;

    const fields: Array<keyof Omit<Product, '_isNew' | '_original' | '_tempId'>> =
      ['code', 'name', 'category', 'quantity', 'price'];

    fields.forEach(field => {
      (product as any)[field] = product._original![field];
    });

    const id = this.keyOf(product);
    this.dirtyKeys.update(set => {
      const next = new Set(set);
      [...next].forEach(k => {
        if (k.startsWith(id + '::')) next.delete(k);
      });
      return next;
    });

    this.products.update(list => [...list]);
  }

  deleteNewRow(product: Product): void {
    if (!product._isNew || !product._tempId) return;

    this.pendingNewRows.update(list =>
      list.filter(p => p._tempId !== product._tempId)
    );

    const id = `temp-${product._tempId}`;
    this.dirtyKeys.update(set => {
      const next = new Set(set);
      [...next].forEach(k => {
        if (k.startsWith(id + '::') || k === id) next.delete(k);
      });
      return next;
    });

    this.pendingFieldValues.update(map => {
      const next = new Map(map);
      [...next.keys()].forEach(k => {
        if (k.startsWith(id + '::')) next.delete(k);
      });
      return next;
    });
  }

  // helper to build a unique key
  private keyOf(product: Product, field?: string): string {
    const id = product.id != null ? String(product.id) : `temp-${product._tempId}`;
    return field ? `${id}::${field}` : id;
  }
}
