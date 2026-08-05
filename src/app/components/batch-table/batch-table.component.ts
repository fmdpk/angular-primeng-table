import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PopoverModule } from 'primeng/popover';
import {
  Table,
  TableColumnReorderEvent,
  TableEditCompleteEvent,
  TableLazyLoadEvent,
  TableModule,
} from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { RowHighlightDirective } from '../../directives/row-highlight.directive';
import {
  BatchCellEditEvent,
  BatchSaveEvent,
  BatchTableItem,
  TableColumnDefinition,
  ValidatorFn,
} from '../../models/batch-table.model';

@Component({
  selector: 'app-batch-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    ButtonModule,
    ConfirmDialogModule,
    ToastModule,
    TooltipModule,
    MultiSelectModule,
    PopoverModule,
    RowHighlightDirective,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './batch-table.component.html',
  styleUrl: './batch-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchTableComponent<
  T extends Record<string, any> = any,
> implements OnDestroy {
  // ---------- Inputs ----------
  /** Current page rows coming from the parent (server data, not merged). */
  readonly value = input.required<T[]>();
  readonly totalRecords = input<number>(0);
  readonly loading = input<boolean>(false);
  readonly rows = input<number>(5);
  readonly columns = input.required<TableColumnDefinition<T>[]>();

  /** Initial visible columns. If omitted, all columns are shown. */
  readonly initialSelectedColumns = input<TableColumnDefinition<T>[] | null>(
    null,
  );

  /** Field used to identify a row uniquely. Defaults to 'id'. */
  readonly keyField = input<string>('id');

  /** Per-field validator map. */
  readonly validators = input<Partial<Record<string, ValidatorFn<T>>>>({});

  readonly scrollHeight = input<string>('500px');
  readonly dir = input<'rtl' | 'ltr'>('rtl');
  readonly allowReorder = input<boolean>(true);
  readonly showAddRow = input<boolean>(true);
  readonly saveConfirmMessage = input<string>(
    'آیا از ذخیره تغییرات مطمئن هستید؟',
  );
  readonly emptyMessage = input<string>('رکوردی یافت نشد');

  // ---------- Outputs ----------
  readonly lazyLoad = output<TableLazyLoadEvent>();
  readonly save = output<BatchSaveEvent<T>>();
  readonly discard = output<void>();
  readonly cellEdit = output<BatchCellEditEvent<T>>();
  readonly columnsReorder = output<TableColumnDefinition<T>[]>();
  readonly selectedColumnsChange = output<TableColumnDefinition<T>[]>();
  readonly onchangeRowCount = output<number>();
  readonly resetRowsCount = output<void>();

  // ---------- ViewChild ----------
  @ViewChild('dt') table!: Table;

  // ---------- Internal state ----------
  readonly pendingFieldValues = signal<Map<string, unknown>>(new Map());
  readonly pendingNewRows = signal<T[]>([]);
  readonly dirtyKeys = signal<Set<string>>(new Set());
  readonly touched = signal<Map<string, Set<string>>>(new Map());

  readonly first = signal(0);
  readonly internalLoading = signal(false);

  /** Currently visible columns (mutable copy). */
  readonly selectedColumns = signal<TableColumnDefinition<T>[]>([]);

  /** Sort / filter state currently applied (mirrors last emitted event). */
  sortField: string | undefined;
  sortOrder = 1;
  filters: Record<string, unknown> = {};
  globalFilterValue = '';

  private augmentedCache = new Map<string, BatchTableItem<T>>();

  private readonly confirmationService = inject(ConfirmationService);
  readonly messageService = inject(MessageService);

  private appliedMultiSortMeta = signal<
    { field: string; order: number }[] | null
  >(null);
  private pendingLazyEvent = signal<TableLazyLoadEvent | null>(null);
  private pendingGlobalFilter = signal<string | null>(null);
  private pendingSortRestore = signal<{
    sortField: string | undefined | null;
    sortOrder: number;
    multiSortMeta: { field: string; order: number }[] | null;
  } | null>(null);
  private pendingPageRestore = signal<{
    first: number;
    rows: number;
  } | null>(null);
  private originalOnColumnResizeEnd?: (...args: unknown[]) => void;

  // ---------- Computed ----------
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

  /**
   * Augments the parent-provided value with `_original`, applies pending
   * field edits, and prepends draft new rows when on the first page.
   */
  readonly tableValue = computed<BatchTableItem<T>[]>(() => {
    const serverRows = this.value();
    const drafts = this.pendingNewRows();
    const first = this.first();
    const keyField = this.keyField();

    const augmented = serverRows.map((row) => {
      const rowKey = String((row as any)[keyField]);

      // Reuse the cached augmented row if the original server row hasn't changed
      let augmentedRow = this.augmentedCache.get(rowKey);
      if (!augmentedRow || augmentedRow._original !== row) {
        augmentedRow = {
          ...row,
          _original: row, // Keep reference to the original server row
        } as BatchTableItem<T>;
        this.augmentedCache.set(rowKey, augmentedRow);
      }

      // Apply pending field values directly to the cached object
      this.pendingFieldValues().forEach((value, key) => {
        if (key.startsWith(`${rowKey}::`)) {
          const field = key.split('::')[1];
          (augmentedRow as any)[field] = value;
        }
      });

      return augmentedRow;
    });

    // Clean up cache for rows that are no longer on the current page
    const currentKeys = new Set(
      serverRows.map((r) => String((r as any)[keyField])),
    );
    for (const key of this.augmentedCache.keys()) {
      if (!currentKeys.has(key)) {
        this.augmentedCache.delete(key);
      }
    }

    return first === 0 && drafts.length
      ? ([...drafts, ...augmented] as BatchTableItem<T>[])
      : augmented;
  });

  /** Numeric totals per field — generic for any numeric field. */
  totalFor(field: string): number {
    return this.tableValue().reduce(
      (sum, row) => sum + (Number(row[field]) || 0),
      0,
    );
  }

  // ---------- Lifecycle ----------
  constructor() {
    afterNextRender(() => {
      this.initSelectedColumns();
      this.patchRtlColumnResize();
    });
  }

  ngOnDestroy(): void {
    if (this.table && this.originalOnColumnResizeEnd) {
      (this.table as any).onColumnResizeEnd = this.originalOnColumnResizeEnd;
      this.originalOnColumnResizeEnd = undefined;
    }
  }

  // ---------- Column selection ----------
  private initSelectedColumns(): void {
    const initial = this.initialSelectedColumns();
    this.selectedColumns.set(
      initial && initial.length ? [...initial] : [...this.columns()],
    );
  }

  onSelectedColumnsChange(cols: TableColumnDefinition<T>[]): void {
    if (!cols?.length) {
      this.selectedColumns.set([...this.columns()]);
    } else {
      this.selectedColumns.set([...cols]);
    }
    this.selectedColumnsChange.emit(this.selectedColumns());
  }

  // ---------- Lazy load ----------
  loadPage(event: TableLazyLoadEvent): void {
    setTimeout(() => {
      const first = event.first ?? 0;
      const rows = event.rows ?? this.rows();
      const sortChanged = this.hasSortChanged(event);
      const filterChanged = this.hasFilterChanged(event.filters);
      this.pendingPageRestore.set(this.capturePageState());
      this.pendingSortRestore.set(this.captureSortState());
      const onlyPaging = !sortChanged && !filterChanged;

      if (this.hasAnyInvalidNewRow() || this.hasAnyInvalidRow()) {
        this.markAllRowsTouched();
        this.messageService.add({
          severity: 'warn',
          summary: 'توجه',
          detail: 'لطفا تمامی موارد نادرست در جدول را برطرف کنید',
        });
        if (sortChanged) this.restoreSortState();
        if (onlyPaging) this.restorePageState();
        return;
      }

      this.first.set(first);

      if (
        this.totalPendingCount() > 0 &&
        (sortChanged || filterChanged || onlyPaging)
      ) {
        this.pendingLazyEvent.set(event);
        this.confirmBeforeViewChange(
          'توجه',
          'قبل از هر اقدامی باید تغییرات ذخیره شود',
          () => this.applyPendingLazyEvent(),
        );
        return;
      }

      this.emitLazyLoad(event);
    }, 0);
  }

  private emitLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.rows();
    this.first.set(first);
    this.sortField = event.sortField as string | undefined;
    this.sortOrder = event.sortOrder ?? 1;
    this.filters = (event.filters as Record<string, unknown>) ?? {};

    if (event.multiSortMeta?.length) {
      this.appliedMultiSortMeta.set(
        event.multiSortMeta.map((m) => ({ field: m.field!, order: m.order! })),
      );
    } else if (event.sortField) {
      this.appliedMultiSortMeta.set([
        { field: event.sortField as string, order: event.sortOrder ?? 1 },
      ]);
    } else {
      this.appliedMultiSortMeta.set(null);
    }

    this.lazyLoad.emit(event);
  }

  // ---------- Global filter ----------
  private globalFilterTimeout?: ReturnType<typeof setTimeout>;
  onGlobalFilter(value: string): void {
    clearTimeout(this.globalFilterTimeout);
    const previous = this.globalFilterValue;
    this.globalFilterValue = value ?? '';

    this.globalFilterTimeout = setTimeout(() => {
      this.handleGlobalFilterChange(this.globalFilterValue, previous);
    }, 500);
  }

  private handleGlobalFilterChange(value: string, previousValue: string): void {
    this.markAllRowsTouched();
    if (this.hasAnyInvalidNewRow() || this.hasAnyInvalidRow()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'توجه',
        detail: 'لطفا تمامی موارد نادرست در جدول را برطرف کنید',
      });
      return;
    }

    if (this.totalPendingCount() > 0 && value !== previousValue) {
      this.pendingGlobalFilter.set(value);
      this.confirmBeforeViewChange(
        'توجه',
        'تغییرات را قبل از جست و جو ذخیره کنید',
        () => {
          this.globalFilterValue = this.pendingGlobalFilter() ?? '';
          this.pendingGlobalFilter.set(null);
          this.first.set(0);
          this.emitLazyLoad({
            first: 0,
            rows: this.rows(),
            sortField: this.sortField,
            sortOrder: this.sortOrder,
            filters: this.filters,
            globalFilter: this.globalFilterValue,
          } as TableLazyLoadEvent);
        },
      );
      return;
    }

    this.first.set(0);
    this.emitLazyLoad({
      first: 0,
      rows: this.rows(),
      sortField: this.sortField,
      sortOrder: this.sortOrder,
      filters: this.filters,
      globalFilter: this.globalFilterValue,
    } as TableLazyLoadEvent);
  }

  // ---------- Cell editing ----------
  onCellEditComplete(event: TableEditCompleteEvent): void {
    const row = event.data as BatchTableItem<T> | undefined;
    const field = event.field as string | undefined;
    if (!row || !field) return;

    if (row._isNew) {
      this.markFieldTouched(row, field);
    }

    this.updateCellValue(row, field, (row as any)[field]);

    this.cellEdit.emit({
      row: row as T,
      field,
      value: (row as any)[field],
    });
  }

  private updateCellValue(
    row: BatchTableItem<T>,
    field: string,
    value: unknown,
  ): void {
    if (field === '_original' || field === '_isNew' || field === '_tempId') {
      return;
    }

    const key = this.buildRowKey(row, field);
    const original = row._original ? (row._original as any)[field] : undefined;

    this.pendingFieldValues.update((map) => {
      const next = new Map(map);
      if (value !== original) next.set(key, value);
      else next.delete(key);
      return next;
    });

    this.dirtyKeys.update((set) => {
      const next = new Set(set);
      if (value !== original) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // ---------- Add row ----------
  startAddRow(): void {
    if (this.hasAnyInvalidNewRow()) {
      this.markAllNewRowsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'توجه',
        detail: 'لطفا تمامی موارد نادرست در جدول را برطرف کنید',
      });
      return;
    }

    if (this.globalFilterValue.length || this.hasFilterInColumns()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'توجه',
        detail: 'برای اضافه کردن سطر ابتدا جست و جو را پاک کنید',
      });
      return;
    }

    // if (this.first() !== 0) {
    //   this.first.set(0);
    //   this.emitLazyLoad({ first: 0, rows: this.rows() });
    // }

    const draft = {
      _isNew: true,
      _tempId:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `temp-${Date.now()}-${Math.random()}`,
    } as BatchTableItem<T>;

    // Initialize empty values for every column so ngModel has something to bind.
    this.columns().forEach((col) => {
      (draft as any)[col.field] = col.type === 'number' ? 1 : '';
    });
    draft._original = { ...(draft as any) };

    this.pendingNewRows.update((rows) => [draft as T, ...rows]);

    this.onchangeRowCount.emit(this.rows() + 1);
  }

  // ---------- Save / Discard ----------
  saveBatch(): void {
    if (this.totalPendingCount() === 0) return;

    setTimeout(() => {
      if (this.hasAnyInvalidNewRow() || this.hasAnyInvalidRow()) {
        this.markAllRowsTouched();
        this.messageService.add({
          severity: 'warn',
          summary: 'توجه',
          detail:
            'لطفا تمامی موارد نادرست در جدول را قبل از ذخیره تغییرات برطرف کنید',
        });
        return;
      }

      this.confirmationService.confirm({
        message: this.saveConfirmMessage(),
        header: 'ذخیره تغییرات',
        acceptLabel: 'ذخیره',
        rejectLabel: 'لغو',
        closable: false,
        closeOnEscape: false,
        rejectButtonProps: { severity: 'secondary', outlined: true },
        icon: 'pi pi-exclamation-triangle',
        accept: () => {
          this.emitSave();
        },
      });
    }, 0);
  }

  private emitSave(): void {
    const updates = this.collectUpdates();
    const creates = this.collectCreates();

    this.save.emit({
      updates,
      creates,
      done: (success: boolean) => {
        if (success) {
          this.resetRowsCount.emit();
          this.resetTracking();
          this.messageService.add({
            severity: 'success',
            summary: 'ذخیره شد',
            detail: 'با موفقیت انجام شد',
          });
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'خطا',
            detail: 'ذخیره سازی ناموفق بود',
          });
        }
      },
    });
  }

  private collectUpdates(): T[] {
    const result = new Map<string, T>();
    const keyField = this.keyField();

    this.pendingFieldValues().forEach((value, key) => {
      if (key.startsWith('temp-')) return;
      const [idStr, field] = key.split('::');
      if (!idStr || !field) return;

      const existing = Array.from(result.keys()).find((k) => k === idStr);
      let row = existing ? result.get(existing!) : undefined;
      if (!row) {
        const serverRow = this.value().find(
          (r) => String((r as any)[keyField]) === idStr,
        );
        if (!serverRow) return;
        row = { ...serverRow };
        result.set(idStr, row);
      }
      (row as any)[field] = value;
    });

    return Array.from(result.values());
  }

  private collectCreates(): T[] {
    return this.pendingNewRows().map((row, index) => {
      const { _isNew, _tempId, _original, ...core } = row as any;
      return { ...core } as T;
    });
  }

  discardAll(): void {
    this.confirmationService.confirm({
      header: 'توجه',
      message: 'تمام تغییرات برگردانده شود؟',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'ادامه',
      rejectLabel: 'لغو',
      closable: false,
      closeOnEscape: false,
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-danger p-button-outlined',
      accept: () => {
        this.resetTracking();
        this.discard.emit();
        this.emitLazyLoad({ first: this.first(), rows: this.rows() });
      },
    });
  }

  // ---------- Undo ----------
  undoCell(row: BatchTableItem<T>, field: string): void {
    if (!row._original) return;
    (row as any)[field] = (row._original as any)[field];
    const key = this.buildRowKey(row, field);

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

  undoRow(row: BatchTableItem<T>): void {
    if (!row._original) return;
    this.columns().forEach((col) => {
      (row as any)[col.field] = (row._original as any)[col.field];
    });
    const id = this.buildRowKey(row);
    this.dirtyKeys.update((set) => {
      const next = new Set(set);
      Array.from(next).forEach((key) => {
        if (key.startsWith(id + '::')) next.delete(key);
      });
      return next;
    });
    this.pendingFieldValues.update((map) => {
      const next = new Map(map);
      Array.from(next.keys()).forEach((key) => {
        if (key.startsWith(id + '::')) next.delete(key);
      });
      return next;
    });
  }

  deleteNewRow(row: BatchTableItem<T>): void {
    if (!row._isNew || !row._tempId) return;
    this.pendingNewRows.update((rows) =>
      rows.filter((r) => (r as any)._tempId !== row._tempId),
    );

    const id = `temp-${row._tempId}`;
    this.dirtyKeys.update((set) => {
      const next = new Set(set);
      Array.from(next).forEach((key) => {
        if (key.startsWith(id + '::') || key === id) next.delete(key);
      });
      return next;
    });
    this.pendingFieldValues.update((map) => {
      const next = new Map(map);
      Array.from(next.keys()).forEach((key) => {
        if (key.startsWith(id + '::')) next.delete(key);
      });
      return next;
    });

    this.onchangeRowCount.emit(this.rows() - 1);
  }

  // ---------- Validation ----------
  getFieldError(row: BatchTableItem<T>, field: string): string | null {
    const validator = this.validators()[field];
    if (!validator) return null;
    return validator((row as any)[field], row as T);
  }

  isRowValid(row: BatchTableItem<T>): boolean {
    return this.columns().every(
      (col) => this.getFieldError(row, col.field) === null,
    );
  }

  hasAnyInvalidRow(): boolean {
    return this.tableValue().some((r) => !r._isNew && !this.isRowValid(r));
  }

  hasAnyInvalidNewRow(): boolean {
    return this.tableValue().some((r) => r._isNew && !this.isRowValid(r));
  }

  markFieldTouched(row: BatchTableItem<T>, field: string): void {
    const rowKey = this.buildRowKey(row);
    this.touched.update((map) => {
      const next = new Map(map);
      const set = next.get(rowKey) ?? new Set<string>();
      set.add(field);
      next.set(rowKey, set);
      return next;
    });
  }

  isFieldTouched(row: BatchTableItem<T>, field: string): boolean {
    const rowKey = this.buildRowKey(row);
    return !!this.touched().get(rowKey)?.has(field);
  }

  markAllRowsTouched(): void {
    this.tableValue().forEach((row) => {
      this.columns().forEach((col) => {
        this.markFieldTouched(row, col.field);
      });
    });
  }

  markAllNewRowsTouched(): void {
    this.tableValue()
      .filter((r) => r._isNew)
      .forEach((row) => {
        this.columns().forEach((col) => {
          this.markFieldTouched(row, col.field);
        });
      });
  }

  // ---------- Dirty helpers ----------
  isCellDirty(row: BatchTableItem<T>, field: string): boolean {
    return this.dirtyKeys().has(this.buildRowKey(row, field));
  }

  isDirty(row: BatchTableItem<T>): boolean {
    if (row._isNew) return true;
    const id = this.buildRowKey(row);
    return Array.from(this.dirtyKeys()).some((k) => k.startsWith(id + '::'));
  }

  private buildRowKey(row: BatchTableItem<T>, field?: string): string {
    const base = row._isNew
      ? `temp-${row._tempId}`
      : String((row as any)[this.keyField()] ?? '');
    return field ? `${base}::${field}` : base;
  }

  private resetTracking(): void {
    this.pendingFieldValues.set(new Map());
    this.pendingNewRows.set([]);
    this.dirtyKeys.set(new Set());
    this.touched.set(new Map());

    this.augmentedCache.clear();
  }

  /** Public method the parent can call to forcibly reset pending state. */
  clearPending(): void {
    this.resetTracking();
  }

  // ---------- Filters in columns ----------
  hasFilterInColumns(): boolean {
    const filters = this.table?.filters ?? {};
    let flag = false;
    for (const field in filters) {
      if (
        Object.hasOwn(filters, field) &&
        Array.isArray(filters[field]) &&
        !flag
      ) {
        filters[field].forEach((element: any) => {
          if (element?.value) flag = true;
        });
      }
    }
    return flag;
  }

  // ---------- TrackBy ----------
  // Use an arrow function to bind 'this' context correctly
  trackByFn = (index: number, row: any): any => {
    if (row?._isNew) return row._tempId;
    return row?.[this.keyField()];
  };

  clear(table: Table) {
    table.clear();
    this.globalFilterValue = '';
  }

  // ---------- Column reorder ----------
  onColReorder(event: TableColumnReorderEvent): void {
    const dragIndex = event.dragIndex;
    const dropIndex = event.dropIndex;
    if (dragIndex == null || dropIndex == null || dragIndex === dropIndex) {
      return;
    }
    const next = [...this.selectedColumns()];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    this.selectedColumns.set(next);
    this.columnsReorder.emit(next);
  }

  // ---------- RTL resize patch ----------
  private isTableRtl(): boolean {
    const el = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!el) return false;
    return (
      el.getAttribute('dir') === 'rtl' ||
      getComputedStyle(el).direction === 'rtl'
    );
  }

  private patchRtlColumnResize(): void {
    const table = this.table as Table & {
      onColumnResizeEnd?: (...args: unknown[]) => void;
      resizeHelperViewChild?: { nativeElement?: HTMLElement };
      lastResizerHelperX?: number;
    };
    if (!table?.onColumnResizeEnd) return;
    if (this.originalOnColumnResizeEnd) return;

    this.originalOnColumnResizeEnd = table.onColumnResizeEnd.bind(table);
    table.onColumnResizeEnd = (...args: unknown[]) => {
      if (this.isTableRtl()) {
        const helper = table.resizeHelperViewChild?.nativeElement;
        const startX = table.lastResizerHelperX;
        if (
          helper &&
          Number.isFinite(startX as number) &&
          Number.isFinite(helper.offsetLeft)
        ) {
          const delta = helper.offsetLeft - (startX as number);
          helper.style.left = `${(startX as number) - delta}px`;
        }
      }
      return this.originalOnColumnResizeEnd?.(...args);
    };
  }

  // ---------- Arrow key navigation ----------
  onEditArrowKey(event: KeyboardEvent): void {
    const isRtl = this.dir() === 'rtl';
    if (!isRtl) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const currentTd = (event.target as HTMLElement).closest('td');
    if (!currentTd) return;
    const row = currentTd.parentElement as HTMLTableRowElement;
    if (!row) return;

    const editableCells = Array.from(
      row.querySelectorAll(
        'td[pEditableColumn], td[ng-reflect-p-editable-column]',
      ),
    ) as HTMLElement[];
    const cells =
      editableCells.length > 0
        ? editableCells
        : (Array.from(row.querySelectorAll('td')).slice(
            0,
            -1,
          ) as HTMLElement[]);
    const currentIndex = cells.indexOf(currentTd as HTMLElement);
    if (currentIndex === -1) return;

    const targetIndex =
      event.key === 'ArrowRight' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= cells.length) return;

    (event.target as HTMLElement).blur();
    cells[targetIndex].click();
  }

  // ---------- Sort / page restore ----------
  private hasFilterChanged(
    filters: Record<string, unknown> | undefined,
  ): boolean {
    if (!filters) return false;
    return JSON.stringify(filters) !== JSON.stringify(this.filters);
  }

  private hasSortChanged(event: TableLazyLoadEvent): boolean {
    const next = event.multiSortMeta?.length
      ? event.multiSortMeta.map((m) => `${m.field}:${m.order}`).join('|')
      : event.sortField
        ? `${event.sortField}:${event.sortOrder ?? 1}`
        : '';

    const previous = this.appliedMultiSortMeta();
    const previousKey = previous?.length
      ? previous.map((m) => `${m.field}:${m.order}`).join('|')
      : '';

    return next !== previousKey;
  }

  private captureSortState() {
    return {
      sortField: this.sortField,
      sortOrder: this.sortOrder,
      multiSortMeta: this.appliedMultiSortMeta()
        ? this.appliedMultiSortMeta()!.map((m) => ({ ...m }))
        : null,
    };
  }

  capturePageState() {
    return { first: this.first(), rows: this.rows() };
  }

  private restoreSortState(): void {
    const previous = this.pendingSortRestore();
    this.pendingSortRestore.set(null);
    if (!previous) return;

    this.sortField = previous.sortField ?? undefined;
    this.sortOrder = previous.sortOrder;
    this.appliedMultiSortMeta.set(
      previous.multiSortMeta
        ? previous.multiSortMeta.map((m) => ({ ...m }))
        : null,
    );

    if (this.table) {
      const meta = previous.multiSortMeta
        ? previous.multiSortMeta.map((m) => ({ ...m }))
        : null;
      this.table.sortField = previous.sortField ?? null;
      this.table.sortOrder = previous.sortOrder;
      this.table.multiSortMeta = meta;
      if (this.table.sortMode === 'multiple') {
        this.table.tableService.onSort(meta);
      } else {
        this.table.tableService.onSort(
          previous.sortField
            ? { field: previous.sortField, order: previous.sortOrder }
            : null,
        );
      }
    }
  }

  restorePageState() {
    const previous = this.pendingPageRestore();
    this.pendingPageRestore.set(null);
    if (!previous) return;
    this.first.set(previous.first);
    this.table.rows = previous.rows;
    this.table.first = previous.first;
  }

  private applyPendingLazyEvent(): void {
    const event = this.pendingLazyEvent();
    this.pendingLazyEvent.set(null);
    this.pendingSortRestore.set(null);
    this.pendingPageRestore.set(null);
    if (event) this.emitLazyLoad(event);
  }

  private confirmBeforeViewChange(
    header: string,
    detail: string,
    onContinue: () => void,
  ): void {
    const pendingSummary = this.buildPendingSummary();
    this.confirmationService.confirm({
      header,
      message: `${pendingSummary} ${detail}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'ادامه',
      rejectLabel: 'لغو',
      closable: false,
      closeOnEscape: false,
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-danger p-button-outlined',
      accept: () => {
        // Auto-save then continue
        this.emitSave();
        // Note: parent must call `done(true)` then trigger onContinue
        // via observing the save output and re-emitting lazyLoad.
        // For simplicity, we expose a hook:
        this.pendingContinueAfterSave = onContinue;
      },
      reject: () => {
        this.pendingLazyEvent.set(null);
        this.restoreSortState();
        this.restorePageState();
      },
    });
  }

  private pendingContinueAfterSave?: () => void;

  private buildPendingSummary(): string {
    const edited = this.editedCount();
    const added = this.addedCount();
    if (edited > 0 && added > 0)
      return `شما ${edited} تغییر دارید و ${added} سطر اضاف کردید`;
    if (edited > 0) return `شما ${edited} تغییر ذخیره نشده دارید`;
    return `شما ${added} سطر اضفه کردید که ذخیره نشده است`;
  }
}
