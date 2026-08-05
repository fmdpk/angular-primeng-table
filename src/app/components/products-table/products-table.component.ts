import { Component, inject, signal } from '@angular/core';
import { Product } from '../../models/product';
import { BatchTableComponent } from '../batch-table/batch-table.component';
import {
  BatchSaveEvent,
  TableColumnDefinition,
  ValidatorFn,
} from '../../models/batch-table.model';

@Component({
  selector: 'app-products-table',
  standalone: true,
  imports: [BatchTableComponent],
  template: `
    <app-batch-table
      [value]="page()"
      [totalRecords]="total()"
      [loading]="loading()"
      [rows]="rows()"
      [columns]="columns"
      [userSelectedRows]="userSelectedRows()"
      [validators]="validators"
      keyField="id"
      (lazyLoad)="onLazyLoad($event)"
      (save)="onSave($event)"
      (discard)="onDiscard()"
      (cellEdit)="onCellEdit($event)"
      (onchangeRowCount)="onAddRow($event)"
      (resetRowsCount)="onResetRows()"
      (columnsReorder)="onColumnsReorder($event)"
    />
  `,
})
export class ProductsTableComponent {
  readonly page = signal<Product[]>([]);
  readonly total = signal(0);
  readonly rows = signal(0);
  readonly userSelectedRows = signal(5);
  readonly loading = signal(false);

  readonly columns: TableColumnDefinition<Product>[] = [
    { field: 'test1', header: 'Code', faHeader: 'کد', width: '15%' },
    { field: 'test2', header: 'Name', faHeader: 'نام', width: '25%' },
    {
      field: 'test3',
      header: 'Family',
      faHeader: 'خانوادگی نام',
      width: '25%',
    },
    { field: 'categoryy', header: 'Category', faHeader: 'دسته', width: '20%' },
    {
      field: 'quantity',
      header: 'Quantity',
      faHeader: 'تعداد',
      width: '15%',
      type: 'number',
    },
    {
      field: 'price',
      header: 'Price',
      faHeader: 'قیمت',
      width: '25%',
      type: 'number',
    },
  ];

  readonly validators: Partial<Record<string, ValidatorFn<Product>>> = {
    test1: (v) => (v ? null : 'کد را وارد کنید'),
    test2: (v) => (v ? null : 'نام را وارد کنید'),
    test3: (v) => (v ? null : 'نام خانوادگی را وارد کنید'),
    quantity: (v) =>
      v === '' || v == null
        ? 'تعداد الزامی است'
        : Number.isNaN(Number(v)) || Number(v) < 0
          ? 'مقدار ≥ 0'
          : null,
    price: (v) =>
      v === '' || v == null
        ? 'قیمت را وارد کنید'
        : Number.isNaN(Number(v)) || Number(v) < 0
          ? 'مقدار ≥ 0'
          : null,
  };

  onLazyLoad(event: any) {
    console.log(event);
    this.loading.set(true);
    // Call your API, then:
    // this.page.set(result.data);
    // this.total.set(result.total);
    this.loading.set(false);
  }

  onSave(event: BatchSaveEvent<Product>) {
    console.log(event);
    this.loading.set(true);

    setTimeout(() => {
      // 1. Create a map of updated rows for quick lookup
      const updatesMap = new Map(event.updates.map((u: any) => [u.id, u]));

      // 2. Map over the CURRENT page to preserve exact order, applying updates if they exist
      const updatedPage = this.page().map((row: any) => {
        const updatedRow = updatesMap.get(row.id);
        return updatedRow ? { ...updatedRow } : row;
      });

      // 3. Simulate backend generating unique IDs for newly created rows
      const savedCreates = event.creates.map((p, index) => ({
        ...p,
        id: Date.now() + index, // Assign a unique ID
      }));

      // 4. Prepend the newly created rows (since drafts are prepended in the child component)
      this.page.set([...savedCreates, ...updatedPage]);

      // 5. Update total records (if using pagination)
      this.total.set(this.page().length);

      this.loading.set(false);

      // 6. Tell the child component to clear its dirty state
      event.done(true);
    }, 500);
  }

  onAddRow(rowCount: number) {
    if (this.page().length <= 5) {
      this.rows.set(rowCount);
      this.total.set(rowCount);
    } else {
      const rows = this.rows() > 0 ? this.rows() : this.rows() + 1;
      const totalPages = +Math.ceil(this.total() / rows);
      this.rows.set(rowCount);
      this.total.set(this.rows() * totalPages);
    }
  }

  onResetRows() {
    this.rows.set(this.userSelectedRows());
    this.total.set(this.page().length);
  }

  onDiscard() {
    // Re-fetch or simply rely on next lazyLoad
  }

  onCellEdit(e: { row: Product; field: string; value: unknown }) {
    // Optional side effects
  }

  onColumnsReorder(cols: TableColumnDefinition<Product>[]) {
    // persist to localStorage, etc.
  }
}
