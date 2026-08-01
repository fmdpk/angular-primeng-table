import {
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import {
  Table,
  TableEditCompleteEvent,
  TableLazyLoadEvent,
  TableModule,
} from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService, SortEvent } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Product } from '../../models/product';
import { TooltipModule } from 'primeng/tooltip';
import { BatchTableStateService } from '../../services/batch-table-state.service';
import { CurrencyDisplayPipe } from '../../pipes/currency-formatter.pipe';
import { RowHighlightDirective } from '../../directives/row-highlight.directive';
import {
  debounceTime,
  distinctUntilChanged,
  Subject,
  Subscription,
} from 'rxjs';

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
    TooltipModule,
    CurrencyDisplayPipe,
    RowHighlightDirective,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './batch-table.component.html',
  styleUrl: './batch-table.component.scss',
})
export class BatchTableComponent implements OnInit, OnDestroy {
  @ViewChild('dt') table!: Table;
  readonly state = inject(BatchTableStateService);
  readonly confirmationService = inject(ConfirmationService);
  readonly messageService = inject(MessageService);

  readonly products = this.state.products;
  readonly totalRecords = this.state.totalRecords;
  readonly first = this.state.first;
  readonly loading = this.state.loading;
  readonly pendingFieldValues = this.state.pendingFieldValues;
  readonly pendingNewRows = this.state.pendingNewRows;
  readonly dirtyKeys = this.state.dirtyKeys;
  readonly addedCount = this.state.addedCount;
  readonly editedCount = this.state.editedCount;
  readonly totalPendingCount = this.state.totalPendingCount;
  readonly hasDraftRow = this.state.hasDraftRow;
  readonly tableValue = this.state.tableValue;
  readonly totalQuantity = this.state.totalQuantity;
  readonly totalPrice = this.state.totalPrice;
  readonly rows = this.state.rows;
  readonly isBrowser = this.state.isBrowser;
  readonly newRowTouched = this.state.newRowTouched;

  draftRow = signal<Product | null>(null);

  sortField: string | undefined;
  sortOrder = 1;
  filters: Record<string, unknown> = {};
  globalFilterValue = '';

  private appliedSort = signal<SortEvent>({ field: undefined, order: 1 });
  private appliedMultiSortMeta = signal<
    { field: string; order: number }[] | null
  >(null);
  private pendingLazyEvent: TableLazyLoadEvent | null = null;
  private pendingGlobalFilter: string | null = null;
  private readonly globalFilterSubject = new Subject<{
    value: string;
    previousValue: string;
  }>();
  private globalFilterSubscription?: Subscription;
  private pendingSortRestore: {
    sortField: string | undefined | null;
    sortOrder: number;
    multiSortMeta: { field: string; order: number }[] | null;
  } | null = null;

  ngOnInit(): void {
    this.state.initializeData();

    this.globalFilterSubscription = this.globalFilterSubject
      .pipe(
        debounceTime(600),
        distinctUntilChanged(
          (previous, current) =>
            previous.value === current.value &&
            previous.previousValue === current.previousValue,
        ),
      )
      .subscribe(({ value, previousValue }) => {
        this.handleGlobalFilterChange(value, previousValue);
      });
  }

  ngOnDestroy(): void {
    this.globalFilterSubscription?.unsubscribe();
  }

  loadPage(event: TableLazyLoadEvent): void {
    console.log('loadPage', event);
    if (!this.isBrowser) {
      return;
    }

    const first = event.first ?? 0;
    const rows = event.rows ?? this.rows;
    const sortChanged = this.hasSortChanged(event);
    const filterChanged = this.hasFilterChanged(event.filters);

    this.state.first.set(first);
    this.state.loading.set(true);

    console.log(sortChanged);
    console.log(filterChanged);

    const onlyPaging = !sortChanged && !filterChanged;

    if (onlyPaging) {
      this.executeLoad(event);
      return;
    }

    if (this.totalPendingCount() > 0 && (sortChanged || filterChanged)) {
      this.pendingLazyEvent = event;

      if (sortChanged) {
        this.pendingSortRestore = this.captureSortState();
        const col = this.state.columnLabel(String(event.sortField));
        this.confirmBeforeViewChange(
          'Save before sorting?',
          `Save your work before sorting by “${col}”?`,
          () => this.applyPendingLazyEvent(),
        );
      } else if (filterChanged) {
        this.pendingSortRestore = null;
        const col = this.guessFilterColumn(event.filters);
        const detail = col
          ? `Save your work before filtering by “${col}”?`
          : 'Save your work before applying filters?';
        this.confirmBeforeViewChange('Save before filtering?', detail, () =>
          this.applyPendingLazyEvent(),
        );
      }
      return;
    }

    this.executeLoad(event);
  }

  onGlobalFilter(value: string): void {
    console.log('onGlobalFilter', value);
    const next = value ?? '';
    this.globalFilterSubject.next({
      value: next,
      previousValue: this.globalFilterValue,
    });
    this.globalFilterValue = next;
  }

  private handleGlobalFilterChange(value: string, previousValue: string): void {
    const next = value ?? '';

    if (this.totalPendingCount() > 0 && next !== previousValue) {
      this.pendingGlobalFilter = next;
      this.confirmBeforeViewChange(
        'Save before searching?',
        'Save your work before running a global search?',
        () => {
          this.globalFilterValue = this.pendingGlobalFilter ?? '';
          this.pendingGlobalFilter = null;
          this.loadPage({
            first: 0,
            rows: this.rows,
            sortField: this.sortField,
            sortOrder: this.sortOrder,
            filters: this.filters,
            globalFilter: this.globalFilterValue,
          } as TableLazyLoadEvent);
        },
      );
      return;
    }

    this.globalFilterValue = next;
    this.loadPage({
      first: 0,
      rows: this.rows,
      sortField: this.sortField,
      sortOrder: this.sortOrder,
      filters: this.filters,
      globalFilter: this.globalFilterValue,
    } as TableLazyLoadEvent);
  }

  mergePending(serverRow: Product): Product {
    return this.state.mergePending(serverRow);
  }

  // ---------- Replace dirty helpers ----------
  isCellDirty(product: Product, field: keyof Product): boolean {
    return this.dirtyKeys().has(this.keyOf(product, field as string));
  }

  isDirty(product: Product): boolean {
    if (product._isNew) return true;
    const id = this.keyOf(product);
    return Array.from(this.dirtyKeys()).some((key) =>
      key.startsWith(id + '::'),
    );
  }

  // call this whenever a cell finishes editing
  onCellEditComplete(event: TableEditCompleteEvent): void {
    const product = event.data as Product | undefined;
    const field = event.field as keyof Product | undefined;
    if (!product || !field) return;

    this.state.updateCellValue(product, field, product[field]);
    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  startAddRow(): void {
    // if (this.hasDraftRow()) return;

    // if (this.first() !== 0) {
    //   this.loadPage({ first: 0, rows: this.rows });
    // }

    this.state.startAddRow();
  }

  confirmAddRow(): void {
    const draft = this.draftRow();
    if (!draft) return;

    if (!draft.code?.trim() || !draft.name?.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Validation',
        detail: 'Code and Name are required',
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
        price: draft.price,
      },
    };

    this.products.update((list) => [newProduct, ...list]);
    this.draftRow.set(null);
  }

  cancelAddRow(): void {
    this.draftRow.set(null);
  }

  // ---------- Batch save → simulate API, then reset tracking ----------
  saveBatch(done?: () => void, showConfirmMessage: boolean = true): void {
    if (this.totalPendingCount() === 0) return;

    if (this.state.hasInvalidNewRows()) {
      // reveal errors on all invalid new fields
      this.pendingNewRows().forEach((p) => {
        if (this.state.isCodeInvalid(p))
          this.state.markNewRowTouched(p, 'code');
        if (this.state.isQuantityInvalid(p))
          this.state.markNewRowTouched(p, 'quantity');
      });

      this.messageService.add({
        severity: 'error',
        summary: 'Validation',
        detail:
          'Fix invalid new rows (Code must start with “P”, Quantity ≥ 5) before saving.',
      });
      return;
    }

    if (showConfirmMessage) {
      this.confirmationService.confirm({
        message: `Save ${this.editedCount()} change(s) and ${this.addedCount()} added row(s)?`,
        header: 'Batch Update',
        icon: 'pi pi-exclamation-triangle',
        accept: () => this.saveBatchAction(done),
      });
      return;
    }

    this.saveBatchAction(done);
    this.state.resetNewRowTouched();
  }

  saveBatchAction(done?: () => void): void {
    const payload = this.state.saveBatch();

    this.messageService.add({
      severity: 'success',
      summary: 'Saved',
      detail: `Saved ${payload.updates.length} update(s) and ${payload.creates.length} new row(s).`,
    });

    const multiSortMeta = this.table?.multiSortMeta?.length
      ? this.table.multiSortMeta.map((meta) => ({ ...meta }))
      : undefined;

    this.loadPage({
      first: this.first(),
      rows: this.rows,
      sortField: this.table?.sortField ?? this.sortField,
      sortOrder: this.table?.sortOrder ?? this.sortOrder,
      filters: this.filters,
      globalFilter: this.globalFilterValue,
      multiSortMeta,
    } as TableLazyLoadEvent);
    done?.();
  }

  discardAll(): void {
    this.state.discardAll();
    this.loadPage({ first: this.first(), rows: this.rows });
  }

  undoCell(
    product: Product,
    field: keyof Omit<Product, '_isNew' | '_original' | '_tempId'>,
  ): void {
    this.state.undoCell(product, field);
    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  undoRow(product: Product): void {
    this.state.undoRow(product);
    this.products.update((list) => [...list]);
  }

  deleteNewRow(product: Product): void {
    this.state.deleteNewRow(product);
  }

  onCustomSort(event: SortEvent): void {
    console.log(event);
    const newField = event.field ?? undefined;
    const newOrder = event.order ?? 0;

    if (
      newField === this.appliedSort().field &&
      newOrder === this.appliedSort().order
    ) {
      return;
    }

    this.applySort(event);
    this.appliedSort.set({ field: newField, order: newOrder });
  }

  private applyPendingLazyEvent(): void {
    if (!this.pendingLazyEvent) return;
    const event = this.pendingLazyEvent;
    this.pendingLazyEvent = null;
    this.pendingSortRestore = null;
    this.executeLoad(event);
  }

  private executeLoad(event: TableLazyLoadEvent): void {
    console.log('executeLoad', event);
    const first = event.first ?? 0;
    const rows = event.rows ?? this.rows;

    this.first.set(first);
    this.sortField = event.sortField as string | undefined;
    this.sortOrder = event.sortOrder ?? 1;
    this.filters = (event.filters as any) ?? {};

    this.loading.set(true);

    window.setTimeout(() => {
      let data = [...this.state.getAllServerData()];

      // global filter (if you store it on the event / component)
      const global = (event.globalFilter as string) || this.globalFilterValue;
      if (global?.trim()) {
        const q = global.trim().toLowerCase();
        data = data.filter((p) =>
          [
            p.code,
            p.name,
            p.category,
            String(p.quantity),
            String(p.price),
          ].some((v) => v?.toLowerCase().includes(q)),
        );
      }

      // column filters (simple contains / equals example)
      data = this.applyColumnFilters(data, event.filters);

      // sort
      const multiSortMeta = event.multiSortMeta?.length
        ? event.multiSortMeta
        : event.sortField
          ? [{ field: event.sortField, order: event.sortOrder ?? 1 }]
          : [];

      if (multiSortMeta.length) {
        data = data.sort((a, b) => {
          for (const meta of multiSortMeta) {
            const field = meta.field as keyof Product;
            const order = meta.order === -1 ? -1 : 1;
            const av = a[field] as any;
            const bv = b[field] as any;

            if (av == null && bv == null) continue;
            if (av == null) return -1 * order;
            if (bv == null) return 1 * order;

            const comparison =
              typeof av === 'string' && typeof bv === 'string'
                ? av.localeCompare(bv)
                : av < bv
                  ? -1
                  : av > bv
                    ? 1
                    : 0;

            if (comparison !== 0) {
              return comparison * order;
            }
          }

          return 0;
        });
      }

      const slice = data
        .slice(first, first + rows)
        .map((p) => this.mergePending({ ...p }));

      if (event.multiSortMeta?.length) {
        this.appliedMultiSortMeta.set(
          event.multiSortMeta.map((m) => ({
            field: m.field!,
            order: m.order!,
          })),
        );
      } else if (event.sortField) {
        this.appliedMultiSortMeta.set([
          { field: event.sortField as string, order: event.sortOrder ?? 1 },
        ]);
      } else {
        this.appliedMultiSortMeta.set(null);
      }

      this.state.setPageData(slice, data.length, first);
    }, 250);
  }

  private hasFilterChanged(filters: any): boolean {
    if (!filters) return false;
    return JSON.stringify(filters) !== JSON.stringify(this.filters);
  }

  private hasSortChanged(event: TableLazyLoadEvent): boolean {
    const next = event.multiSortMeta?.length
      ? event.multiSortMeta.map((m) => `${m.field}:${m.order}`).join('|')
      : event.sortField
        ? `${event.sortField}:${event.sortOrder ?? 1}`
        : '';

    const prev = this.appliedMultiSortMeta();
    const prevKey = prev?.length
      ? prev.map((m) => `${m.field}:${m.order}`).join('|')
      : '';

    return next !== prevKey;
  }

  private guessFilterColumn(filters: any): string | null {
    if (!filters) return null;
    for (const field of Object.keys(filters)) {
      if (field === 'global') continue;
      const meta = filters[field];
      const active = Array.isArray(meta)
        ? meta.some((m: any) => m?.value != null && m.value !== '')
        : meta?.value != null && meta.value !== '';
      if (active) return this.state.columnLabel(field);
    }
    return null;
  }

  private applyColumnFilters(data: Product[], filters: any): Product[] {
    if (!filters) return data;
    let result = data;

    Object.keys(filters).forEach((field) => {
      if (field === 'global') return;
      const meta = filters[field];
      const constraints = Array.isArray(meta) ? meta : [meta];

      constraints.forEach((c: any) => {
        if (c?.value == null || c.value === '') return;
        const val = String(c.value).toLowerCase();
        result = result.filter((row) => {
          const cell = String((row as any)[field] ?? '').toLowerCase();
          // simplify: contains
          return cell.includes(val);
        });
      });
    });

    return result;
  }

  /** Shared confirm: Save & continue | Discard & continue | Cancel */
  private confirmBeforeViewChange(
    header: string,
    detail: string,
    onContinue: (saved: boolean) => void,
  ): void {
    this.confirmationService.confirm({
      header,
      message: `${this.state.pendingMessage()} ${detail}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Save & continue',
      rejectLabel: 'Discard & continue',
      closable: false,
      closeOnEscape: false,
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-danger p-button-outlined',
      accept: () => {
        this.saveBatch(() => onContinue(true), false);
      },
      reject: () => {
        this.pendingLazyEvent = null;
        this.loading.set(false);
        this.restoreSortState();
      },
    });
  }

  // helper to build a unique key
  private keyOf(product: Product, field?: string): string {
    const id =
      product.id != null ? String(product.id) : `temp-${product._tempId}`;
    return field ? `${id}::${field}` : id;
  }

  private applySort(event: SortEvent) {
    // Classic PrimeNG custom-sort implementation
    event.data!.sort((data1: any, data2: any) => {
      const value1 = data1[event.field!];
      const value2 = data2[event.field!];
      let result = 0;

      if (value1 == null && value2 != null) result = -1;
      else if (value1 != null && value2 == null) result = 1;
      else if (value1 == null && value2 == null) result = 0;
      else if (typeof value1 === 'string' && typeof value2 === 'string') {
        result = value1.localeCompare(value2);
      } else {
        result = value1 < value2 ? -1 : value1 > value2 ? 1 : 0;
      }

      return event.order! * result;
    });
  }

  private captureSortState(): {
    sortField: string | undefined | null;
    sortOrder: number;
    multiSortMeta: { field: string; order: number }[] | null;
  } {
    return {
      sortField: this.sortField,
      sortOrder: this.sortOrder,
      multiSortMeta: this.appliedMultiSortMeta()
        ? this.appliedMultiSortMeta()!.map((meta) => ({ ...meta }))
        : null,
    };
  }

  private restoreSortState(): void {
    const previous = this.pendingSortRestore;
    this.pendingSortRestore = null;

    if (!previous) {
      return;
    }

    this.sortField = previous.sortField ?? undefined;
    this.sortOrder = previous.sortOrder;
    this.appliedMultiSortMeta.set(
      previous.multiSortMeta
        ? previous.multiSortMeta.map((meta) => ({ ...meta }))
        : null,
    );
    this.appliedSort.set({
      field: previous.sortField ?? undefined,
      order: previous.sortOrder,
    });

    if (this.table) {
      const restoredMultiSortMeta = previous.multiSortMeta
        ? previous.multiSortMeta.map((meta) => ({ ...meta }))
        : null;

      this.table.sortField = previous.sortField ?? null;
      this.table.sortOrder = previous.sortOrder;
      this.table.multiSortMeta = restoredMultiSortMeta;

      if (this.table.sortMode === 'multiple') {
        this.table.tableService.onSort(restoredMultiSortMeta);
      } else {
        this.table.tableService.onSort(
          previous.sortField
            ? { field: previous.sortField, order: previous.sortOrder }
            : null,
        );
      }
    }
  }

  clear(table: Table) {
    table.clear();
    this.globalFilterValue = '';
  }
}
