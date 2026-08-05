import {
  afterNextRender,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
  WritableSignal,
} from '@angular/core';
import {
  Table,
  TableColumnReorderEvent,
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
import { TooltipModule } from 'primeng/tooltip';
import { MultiSelectModule } from 'primeng/multiselect';
import { PopoverModule } from 'primeng/popover';
import {
  debounceTime,
  distinctUntilChanged,
  Subject,
  Subscription,
} from 'rxjs';
import { RowHighlightDirective } from '../../directives/row-highlight.directive';
import {
  DEFAULT_TABLE_COLUMNS,
  TABLE_COLUMNS_STORAGE_KEY,
} from '../../constants/table-columns';
import {
  reconcileSelectedColumns,
  resolveSelectedColumns,
} from '../../utils/column-selection.util';
import { BatchTableStateService } from '../../services/batch-table-state.service';
import { TableColumnDefinition } from '../../models/table-column-definition';
import { Product } from '../../models/product';

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
    RowHighlightDirective,
    MultiSelectModule,
    PopoverModule,
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
  readonly tableValue = this.state.tableValue;
  readonly totalQuantity = this.state.totalQuantity;
  readonly totalPrice = this.state.totalPrice;
  rows = this.state.rows;
  readonly isBrowser = this.state.isBrowser;

  sortField: string | undefined;
  sortOrder = 1;
  filters: Record<string, unknown> = {};
  globalFilterValue = '';

  readonly columns: TableColumnDefinition[] = DEFAULT_TABLE_COLUMNS;
  selectedColumns: WritableSignal<TableColumnDefinition[]> = signal([
    ...DEFAULT_TABLE_COLUMNS,
  ]);

  private appliedSort = signal<SortEvent>({ field: undefined, order: 1 });
  private appliedMultiSortMeta = signal<
    { field: string; order: number }[] | null
  >(null);
  private pendingLazyEvent = signal<TableLazyLoadEvent | null>(null);
  private pendingGlobalFilter = signal<string | null>(null);
  private readonly globalFilterSubject = new Subject<{
    value: string;
    previousValue: string;
  }>();
  private globalFilterSubscription?: Subscription;
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

  /**
   * Constructs the component and wires the initial RTL resize patch.
   */
  constructor() {
    afterNextRender(() => this.patchRtlColumnResize());
  }

  /**
   * Initializes the component state, restores saved preferences, and starts listening for global filter changes.
   */
  ngOnInit(): void {
    this.state.initializeData();
    this.restoreSelectedColumns();

    this.globalFilterSubscription = this.globalFilterSubject
      .pipe(
        debounceTime(500),
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

  /**
   * Restores the saved visible column selection from local storage.
   */
  private restoreSelectedColumns(): void {
    try {
      const raw = localStorage.getItem(TABLE_COLUMNS_STORAGE_KEY);
      const savedColumns = raw
        ? (JSON.parse(raw) as TableColumnDefinition[])
        : null;

      this.selectedColumns.set(
        resolveSelectedColumns(this.columns, savedColumns),
      );
      this.saveSelectedColumns();
    } catch {
      this.selectedColumns.set([...this.columns]);
      this.saveSelectedColumns();
    }
  }

  /**
   * Persists the current visible column selection to local storage.
   */
  private saveSelectedColumns(): void {
    try {
      localStorage.setItem(
        TABLE_COLUMNS_STORAGE_KEY,
        JSON.stringify(this.selectedColumns() ?? []),
      );
    } catch {
      // ignore private mode / quota issues
    }
  }

  /**
   * Updates the visible column selection when the user changes it.
   */
  onSelectedColumnsChange(cols: TableColumnDefinition[]): void {
    if (!cols?.length) {
      this.selectedColumns.set([...this.columns]);
      this.saveSelectedColumns();
      return;
    }

    this.selectedColumns.set(
      reconcileSelectedColumns(this.selectedColumns(), cols),
    );
    this.saveSelectedColumns();
  }

  /**
   * Determines whether the current table is rendered in RTL mode.
   */
  private isTableRtl(): boolean {
    const element = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!element) return false;

    return (
      element.getAttribute('dir') === 'rtl' ||
      getComputedStyle(element).direction === 'rtl'
    );
  }

  /**
   * Adjusts the column resize behavior for RTL tables.
   */
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
          const currentLeft = helper.offsetLeft;
          const delta = currentLeft - (startX as number);
          helper.style.left = `${(startX as number) - delta}px`;
        }
      }

      return this.originalOnColumnResizeEnd?.(...args);
    };
  }

  /**
   * Loads the requested table page while respecting pending edits and view changes.
   */
  loadPage(event: TableLazyLoadEvent): void {
    if (!this.isBrowser) {
      return;
    }

    setTimeout(() => {
      const first = event.first ?? 0;
      const rows = event.rows ?? this.rows;
      const sortChanged = this.hasSortChanged(event);
      const filterChanged = this.hasFilterChanged(event.filters);
      this.pendingPageRestore.set(this.capturePageState());
      this.pendingSortRestore.set(this.captureSortState());
      const onlyPaging = !sortChanged && !filterChanged;

      if (this.state.hasAnyInvalidNewRow() || this.state.hasAnyInvalidRow()) {
        this.state.markAllRowsTouched();
        this.messageService.add({
          severity: 'warn',
          summary: 'توجه',
          detail: 'لطفا تمامی موارد نادرست در جدول را برطرف کنید',
        });
        if (sortChanged) this.restoreSortState();
        if (onlyPaging) this.restorePageState();
        return;
      }

      this.state.first.set(first);
      this.state.loading.set(true);

      if (
        this.totalPendingCount() > 0 &&
        (sortChanged || filterChanged || onlyPaging)
      ) {
        this.pendingLazyEvent.set(event);

        this.confirmBeforeViewChange(
          'توجه',
          `قبل از هر اقدامی باید تغییرات ذخیره شود`,
          () => this.applyPendingLazyEvent(),
        );
        return;
      }

      this.executeLoad(event);
    }, 0);
  }

  /**
   * Queues a global filter change for the table.
   */
  onGlobalFilter(value: string): void {
    const next = value ?? '';
    this.globalFilterSubject.next({
      value: next,
      previousValue: this.globalFilterValue,
    });
    this.globalFilterValue = next;
  }

  /**
   * Applies a global filter change and reloads the table data when needed.
   */
  private handleGlobalFilterChange(value: string, previousValue: string): void {
    const next = value ?? '';

    this.state.markAllRowsTouched();
    if (this.state.hasAnyInvalidNewRow() || this.state.hasAnyInvalidRow()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'توجه',
        detail: 'لطفا تمامی موارد نادرست در جدول را برطرف کنید',
      });
      return;
    }

    if (this.totalPendingCount() > 0 && next !== previousValue) {
      this.pendingGlobalFilter.set(next);
      this.confirmBeforeViewChange(
        'توجه',
        'تغییرات را قبل از جست و جو ذخیره کنید',
        () => {
          this.globalFilterValue = this.pendingGlobalFilter() ?? '';
          this.pendingGlobalFilter.set(null);
          this.resetRows();
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

  /**
   * Resets the visible row list to the current state.
   */
  resetRows() {
    this.state.totalRecords.set(this.state.rows);
    this.rows = this.state.rows;
  }

  /**
   * Merges pending field edits into the row data before it is displayed.
   */
  mergePending(serverRow: Product): Product {
    return this.state.mergePending(serverRow);
  }

  /**
   * Returns whether a specific cell currently has unsaved changes.
   */
  isCellDirty(product: Product, field: string): boolean {
    return this.state.isCellDirty(product, field);
  }

  /**
   * Returns whether a row currently has unsaved changes.
   */
  isDirty(product: Product): boolean {
    return this.state.isDirty(product);
  }

  /**
   * Stores the latest value entered in an editable table cell.
   */
  onCellEditComplete(event: TableEditCompleteEvent): void {
    const product = event.data as Product | undefined;
    const field = event.field as keyof Product | undefined;
    if (!product || !field) return;

    if (product._isNew) {
      this.state.markFieldTouched(product, field);
    }

    this.state.updateCellValue(product, field, product[field]);
    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  /**
   * Starts adding a new draft row to the table.
   */
  startAddRow(): void {
    if (this.state.hasAnyInvalidNewRow()) {
      this.state.markAllNewRowsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'توجه',
        detail: 'لطفا تمامی موارد نادرست در جدول را برطرف کنید',
      });
      return;
    }

    if (this.globalFilterValue.length || this.hasFilterInColumns()) {
      this.state.markAllNewRowsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'توجه',
        detail: 'برای اضافه کردن سطر ابتدا جست و جو را پاک کنید',
      });
      return;
    }

    // if (this.first() !== 0) {
    //   this.loadPage({ first: 0, rows: this.rows });
    // }
    this.state.startAddRow();
  }

  /**
   * Checks whether any column filters currently contain values.
   */
  hasFilterInColumns(): boolean {
    const filters = this.table.filters;
    let hasFilter = false;
    for (const field in filters) {
      if (Object.hasOwn(filters, field) && Array.isArray(filters[field])) {
        filters[field].forEach((element) => {
          hasFilter = !!element.value;
        });
      }
    }

    return hasFilter;
  }

  /**
   * Saves all pending edits and new rows.
   */
  saveBatch(done?: () => void, showConfirmMessage: boolean = true): void {
    if (this.totalPendingCount() === 0) return;

    setTimeout(() => {
      if (this.state.hasAnyInvalidNewRow() || this.state.hasAnyInvalidRow()) {
        this.state.markAllRowsTouched();
        this.messageService.add({
          severity: 'warn',
          summary: 'توجه',
          detail:
            'لطفا تمامی موارد نادرست در جدول را قبل از ذخیره تغییرات برطرف کنید',
        });
        return;
      }

      if (showConfirmMessage) {
        this.confirmationService.confirm({
          message: `ذخیره سازی ${this.addedCount()} سطر اضافه شده و ${this.editedCount()} تغییر انجام شده؟`,
          header: 'ذخیره تغییرات',
          acceptLabel: 'ذخیره',
          closable: false,
          closeOnEscape: false,
          rejectLabel: 'لغو',
          rejectButtonProps: {
            severity: 'secondary',
            outlined: true,
          },
          icon: 'pi pi-exclamation-triangle',
          accept: () => this.saveBatchAction(done),
        });
        return;
      }

      this.saveBatchAction(done);
    }, 0);
  }

  /**
   * Applies the batch save and reloads the table state.
   */
  saveBatchAction(done?: () => void): void {
    const payload = this.state.saveBatch();

    this.messageService.add({
      severity: 'success',
      summary: 'ذخیره شد',
      detail: 'با موفقیت انجام شد',
    });

    const multiSortMeta = this.table?.multiSortMeta?.length
      ? this.table.multiSortMeta.map((meta) => ({ ...meta }))
      : undefined;

    this.pendingPageRestore.set(null);
    this.state.resetRows();

    this.loadPage({
      first: this.first(),
      rows: this.state.rows,
      sortField: this.table?.sortField ?? this.sortField,
      sortOrder: this.table?.sortOrder ?? this.sortOrder,
      filters: this.filters,
      globalFilter: this.globalFilterValue,
      multiSortMeta,
    } as TableLazyLoadEvent);
    done?.();
  }

  /**
   * Discards all pending changes after user confirmation.
   */
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
        this.state.discardAll();
        this.state.resetRows();
        this.loadPage({ first: this.first(), rows: this.state.rows });
      },
    });
  }

  /**
   * Reverts a single edited cell to its original value.
   */
  undoCell(product: Product, field: string): void {
    this.state.undoCell(product, field as keyof Product);
    this.products.update((list) => [...list]);
    this.pendingNewRows.update((list) => [...list]);
  }

  /**
   * Reverts all edits for a single row to their original values.
   */
  undoRow(product: Product): void {
    this.state.undoRow(product);
    this.products.update((list) => [...list]);
  }

  /**
   * Removes a newly added draft row from the pending list.
   */
  deleteNewRow(product: Product): void {
    this.state.deleteNewRow(product);
  }

  /**
   * Applies the pending lazy-load event after confirmation completes.
   */
  private applyPendingLazyEvent(): void {
    if (!this.pendingLazyEvent()) return;
    const event = this.pendingLazyEvent();
    this.pendingLazyEvent.set(null);
    this.pendingSortRestore.set(null);
    this.pendingPageRestore.set(null);
    this.executeLoad(event!);
  }

  /**
   * Loads and transforms the table data for the current page, sort, and filter state.
   */
  private executeLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.state.rows;

    this.first.set(first);
    this.sortField = event.sortField as string | undefined;
    this.sortOrder = event.sortOrder ?? 1;
    this.filters = (event.filters as Record<string, unknown>) ?? {};

    this.loading.set(true);

    window.setTimeout(() => {
      let data = [...this.state.getAllServerData()];

      const global = (event.globalFilter as string) || this.globalFilterValue;
      if (global?.trim()) {
        const query = global.trim().toLowerCase();
        data = data.filter((product) =>
          [
            product.code,
            product.name,
            product.category,
            String(product.quantity),
            String(product.price),
          ].some((value) => value?.toLowerCase().includes(query)),
        );
      }

      data = this.applyColumnFilters(data, event.filters);

      const multiSortMeta = event.multiSortMeta?.length
        ? event.multiSortMeta
        : event.sortField
          ? [{ field: event.sortField, order: event.sortOrder ?? 1 }]
          : [];

      if (multiSortMeta.length) {
        data = data.sort((left, right) => {
          for (const meta of multiSortMeta) {
            const field = meta.field as keyof Product;
            const order = meta.order === -1 ? -1 : 1;
            const leftValue = left[field] as number | string | undefined;
            const rightValue = right[field] as number | string | undefined;

            if (leftValue == null && rightValue == null) continue;
            if (leftValue == null) return -1 * order;
            if (rightValue == null) return 1 * order;

            const comparison =
              typeof leftValue === 'string' && typeof rightValue === 'string'
                ? leftValue.localeCompare(rightValue)
                : leftValue < rightValue
                  ? -1
                  : leftValue > rightValue
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
        .map((product) => this.mergePending({ ...product }));

      if (event.multiSortMeta?.length) {
        this.appliedMultiSortMeta.set(
          event.multiSortMeta.map((meta) => ({
            field: meta.field!,
            order: meta.order!,
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

  /**
   * Checks whether the active column filters changed since the last load.
   */
  private hasFilterChanged(
    filters: Record<string, unknown> | undefined,
  ): boolean {
    if (!filters) return false;
    return JSON.stringify(filters) !== JSON.stringify(this.filters);
  }

  /**
   * Checks whether the active sort state changed since the last load.
   */
  private hasSortChanged(event: TableLazyLoadEvent): boolean {
    const next = event.multiSortMeta?.length
      ? event.multiSortMeta
          .map((meta) => `${meta.field}:${meta.order}`)
          .join('|')
      : event.sortField
        ? `${event.sortField}:${event.sortOrder ?? 1}`
        : '';

    const previous = this.appliedMultiSortMeta();
    const previousKey = previous?.length
      ? previous.map((meta) => `${meta.field}:${meta.order}`).join('|')
      : '';

    return next !== previousKey;
  }

  /**
   * Applies the column filter constraints to the dataset.
   */
  private applyColumnFilters(
    data: Product[],
    filters: Record<string, unknown> | undefined,
  ): Product[] {
    if (!filters) return data;

    let result = data;

    Object.keys(filters).forEach((field) => {
      if (field === 'global') return;
      const meta = filters[field];
      const constraints = Array.isArray(meta) ? meta : [meta];

      constraints.forEach((constraint: unknown) => {
        if (!constraint || typeof constraint !== 'object') return;
        const value = (constraint as { value?: unknown }).value;
        if (value == null || value === '') return;
        const normalized = String(value).toLowerCase();
        result = result.filter((row) => {
          const cell = String(
            (row as unknown as Record<string, unknown>)[field] ?? '',
          ).toLowerCase();
          return cell.includes(normalized);
        });
      });
    });

    return result;
  }

  /**
   * Shows a confirmation dialog before changing the active view.
   */
  private confirmBeforeViewChange(
    header: string,
    detail: string,
    onContinue: (saved: boolean) => void,
  ): void {
    this.confirmationService.confirm({
      header,
      message: `${this.state.pendingMessage()} ${detail}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'ادامه',
      rejectLabel: 'لغو',
      closable: false,
      closeOnEscape: false,
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-danger p-button-outlined',
      accept: () => {
        this.saveBatch(() => onContinue(true), false);
      },
      reject: () => {
        this.pendingLazyEvent.set(null);
        this.loading.set(false);
        this.restoreSortState();
        this.restorePageState();
      },
    });
  }

  /**
   * Captures the current sort state for later restoration.
   */
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

  /**
   * Captures the current page state for later restoration.
   */
  capturePageState() {
    return {
      first: this.first(),
      rows: this.rows,
    };
  }

  /**
   * Restores the previously captured sort state.
   */
  private restoreSortState(): void {
    const previous = this.pendingSortRestore();
    this.pendingSortRestore.set(null);

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

  /**
   * Restores the previously captured page state.
   */
  restorePageState() {
    const previous = this.pendingPageRestore();
    this.pendingPageRestore.set(null);
    if (!previous) {
      return;
    }
    this.first.set(previous.first);
    this.state.rows = previous.rows;
    this.table.rows = previous.rows;
    this.table.first = previous.first;
  }

  /**
   * Handles keyboard navigation for editable cells in RTL mode.
   */
  onEditArrowKey(event: KeyboardEvent): void {
    const isRtl =
      this.table?.el?.nativeElement?.getAttribute('dir') === 'rtl' ||
      getComputedStyle(this.table?.el?.nativeElement).direction === 'rtl';

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

    let targetIndex: number;
    if (event.key === 'ArrowRight') {
      targetIndex = currentIndex - 1;
    } else {
      targetIndex = currentIndex + 1;
    }

    if (targetIndex < 0 || targetIndex >= cells.length) return;

    const targetCell = cells[targetIndex];
    (event.target as HTMLElement).blur();
    targetCell.click();
  }

  /**
   * Clears the table filters and resets the global filter value.
   */
  clear(table: Table) {
    table.clear();
    this.globalFilterValue = '';
  }

  /**
   * Persists the reordered column layout after a drag-and-drop action.
   */
  onColReorder(event: TableColumnReorderEvent): void {
    const columns = (
      event as TableColumnReorderEvent & { columns?: TableColumnDefinition[] }
    ).columns;

    if (Array.isArray(columns) && columns.length) {
      const reordered = columns.filter((column) =>
        this.columns.some(
          (availableColumn) => availableColumn.field === column.field,
        ),
      );

      if (reordered.length) {
        this.selectedColumns.set(
          resolveSelectedColumns(this.columns, reordered),
        );
        this.saveSelectedColumns();
        return;
      }
    }

    const dragIndex = event.dragIndex;
    const dropIndex = event.dropIndex;
    if (
      dragIndex == null ||
      dropIndex == null ||
      dragIndex === dropIndex ||
      dragIndex < 0 ||
      dropIndex < 0 ||
      dragIndex >= this.selectedColumns().length ||
      dropIndex >= this.selectedColumns().length
    ) {
      return;
    }

    const next = [...this.selectedColumns()];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    this.selectedColumns.set(next);
    this.saveSelectedColumns();
  }

  /**
   * Cleans up subscriptions and restores the original resize handler.
   */
  ngOnDestroy(): void {
    this.globalFilterSubscription?.unsubscribe();

    if (this.table && this.originalOnColumnResizeEnd) {
      (
        this.table as { onColumnResizeEnd?: (...args: unknown[]) => void }
      ).onColumnResizeEnd = this.originalOnColumnResizeEnd;
      this.originalOnColumnResizeEnd = undefined;
    }
  }
}
