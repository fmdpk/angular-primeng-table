import {
  Component,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  TemplateRef,
  viewChild,
  ViewChild,
} from '@angular/core';
import { TableItem } from '../../models/table-item';
import { BatchTableComponent } from '../batch-table/batch-table.component';
import {
  BatchSaveEvent,
  TableColumnDefinition,
  ValidatorFn,
} from '../../models/batch-table.model';
import { isPlatformBrowser } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-products-table',
  standalone: true,
  providers: [MessageService],
  imports: [
    BatchTableComponent,
    ButtonModule,
    ReactiveFormsModule,
    FormsModule,
    InputTextModule,
    SelectModule,
  ],
  template: `
    <app-batch-table
      [value]="page()"
      [totalRecords]="total()"
      [loading]="loading()"
      [rows]="rows()"
      [columns]="columns"
      [userSelectedRows]="userSelectedRows()"
      [validators]="validators"
      [initialSelectedColumns]="initialSelectedColumns()"
      keyField="id"
      (lazyLoad)="onLazyLoad($event)"
      (save)="onSave($event)"
      (discard)="onDiscard()"
      (cellEdit)="onCellEdit($event)"
      (onchangeRowCount)="onAddRow($event)"
      (resetRowsCount)="onResetRows()"
      (selectedColumnsChange)="onSelectedColumnsChange($event)"
      (columnsReorder)="onColumnsReorder($event)"
      [headerFormTemplate]="headerForm"
      [editorInputTemplate]="customCellInput"
      [headerFormActionTemplate]="headerSubmit"
    />

    <ng-template #headerForm let-col>
      <ng-container [formGroup]="addRowForm">
        <div class="flex flex-col gap-1 w-full" style="display: block;">
          @switch (col.field) {
            @case ('category') {
              <p-select
                [options]="categories"
                [formControlName]="col.field"
                [placeholder]="col.faHeader"
                appendTo="body"
                styleClass="w-full"
                [style]="{ width: '100%' }"
                [class.p-invalid]="
                  addRowForm.get(col.field)?.invalid &&
                  addRowForm.get(col.field)?.touched
                "
              />
            }
            @default {
              <input
                pInputText
                [type]="col.type === 'number' ? 'number' : 'text'"
                [formControlName]="col.field"
                [placeholder]="col.faHeader"
                class="w-full"
                [class.p-invalid]="
                  addRowForm.get(col.field)?.invalid &&
                  addRowForm.get(col.field)?.touched
                "
                [class.ng-invalid]="
                  addRowForm.get(col.field)?.invalid &&
                  addRowForm.get(col.field)?.touched
                "
              />
            }
          }

          <!-- Show error message under the input -->
          <small class="p-error text-xs">
            @if (
              addRowForm.get(col.field)?.invalid &&
              addRowForm.get(col.field)?.touched
            ) {
              {{ getErrorMessage(col.field) }}
            }
          </small>
        </div>
      </ng-container>
    </ng-template>

    <!-- 2. Template for the submit button -->
    <ng-template #headerSubmit>
      <p-button
        (onClick)="submitNewRow()"
        icon="pi pi-plus"
        size="small"
        [rounded]="true"
      />
    </ng-template>

    <!-- Define Custom Cell Input Template -->
    <!-- Inside products-table.component.ts template -->
    <ng-template #customCellInput let-row let-column="column" let-table="table">
      <!-- Wrapper div to hold input and error message -->
      <div class="flex flex-column gap-1 w-full">
        @switch (column.field) {
          @case ('code') {
            <input
              pInputText
              type="number"
              [ngModel]="row[column.field]"
              (ngModelChange)="onCodeChange(table, row, $event)"
              class="w-full"
              [class.p-invalid]="
                table.isFieldTouched(row, column.field) &&
                table.getFieldError(row, column.field)
              "
            />
          }

          @case ('category') {
            <p-select
              [options]="categories"
              [ngModel]="row[column.field]"
              (ngModelChange)="
                onStandardChange(table, row, column.field, $event)
              "
              [placeholder]="column.faHeader"
              appendTo="body"
              styleClass="w-full p-custom-select"
              [style]="{ width: '100%' }"
              [class.p-invalid]="
                addRowForm.get(column.field)?.invalid &&
                addRowForm.get(column.field)?.touched
              "
            />
          }

          @default {
            <input
              pInputText
              type="text"
              [ngModel]="row[column.field]"
              (ngModelChange)="
                onStandardChange(table, row, column.field, $event)
              "
              class="w-full"
              [class.p-invalid]="
                table.isFieldTouched(row, column.field) &&
                table.getFieldError(row, column.field)
              "
            />
          }
        }

        <!-- Show validation message under the input while editing -->
        @if (
          table.isFieldTouched(row, column.field) &&
            table.getFieldError(row, column.field);
          as err
        ) {
          <small class="p-error text-xs">{{ err }}</small>
        }
      </div>
    </ng-template>
  `,
})
export class ProductsTableComponent implements OnInit {
  // References to templates
  readonly batchTable = viewChild(BatchTableComponent<TableItem>);
  @ViewChild('headerForm') headerForm!: TemplateRef<any>;
  @ViewChild('customCellInput') customCellInput!: TemplateRef<any>;

  readonly selectedColumnsKey = signal('PRODUCT_TABLE_SELECTED_COLUMNS');
  readonly page = signal<TableItem[]>([]);
  readonly total = signal(0);
  readonly rows = signal(5);
  readonly userSelectedRows = signal(5);
  readonly loading = signal(false);
  private readonly platformId = inject(PLATFORM_ID);
  readonly isBrowser = isPlatformBrowser(this.platformId);
  initialSelectedColumns = signal<TableColumnDefinition<TableItem>[]>([]);

  readonly columns: TableColumnDefinition<TableItem>[] = [
    { field: 'code', header: 'Code', faHeader: 'کد', width: '15%' },
    { field: 'name', header: 'Name', faHeader: 'نام', width: '25%' },
    { field: 'category', header: 'Category', faHeader: 'دسته', width: '20%' },
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

  // 1. Add categories for the select dropdown
  categories = ['دسته 1', 'دسته 2', 'دسته 3'];

  private fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  addRowForm = this.fb.group(
    this.columns.reduce(
      (acc, col) => {
        // Make all fields required. Add more specific validators if needed.
        const validators = [Validators.required];
        if (col.type === 'number') {
          validators.push(Validators.min(0));
        }
        acc[col.field] = ['', validators];
        return acc;
      },
      {} as Record<string, any>,
    ),
  );

  readonly validators: Partial<Record<string, ValidatorFn<TableItem>>> = {
    code: (v) => (v ? null : 'کد را وارد کنید'),
    name: (v) => (v ? null : 'نام را وارد کنید'),
    category: (v) => (v ? null : 'دسته را وارد کنید'),
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

  ngOnInit(): void {
    if (this.isBrowser) {
      this.initialSelectedColumns.set(
        JSON.parse(localStorage.getItem(this.selectedColumnsKey())!),
      );
    }
  }

  // 1. Handle Header Form Submission
  submitNewRow() {
    if (this.addRowForm.invalid) {
      this.addRowForm.markAllAsTouched(); // Triggers UI error display
      this.messageService.add({
        severity: 'warn',
        summary: 'توجه',
        detail: 'لطفا تمامی فیلدها را به درستی پر کنید',
      });
      return;
    }

    const formValue = this.addRowForm.value;
    console.log('Form value:', formValue);
    this.loading.set(true);

    setTimeout(() => {
      const serverResponse = { ...formValue, id: Date.now() };

      // Call the child component using the viewChild signal
      const table = this.batchTable();
      if (table) {
        table.addDraftRow(serverResponse);
        console.log('Draft row added to table!');
        this.loading.set(false);
      } else {
        console.error('BatchTable component not found!');
      }

      this.addRowForm.reset(); // Resets all dynamic controls
      this.onAddRow(this.rows() + 1); // Increment the row count
    }, 500);
  }

  getErrorMessage(field: string): string {
    const control = this.addRowForm.get(field);
    if (control?.hasError('required')) {
      return 'این فیلد الزامی است';
    }
    if (control?.hasError('min')) {
      return 'مقدار باید بزرگتر از 0 باشد';
    }
    return 'مقدار نامعتبر است';
  }

  // 2. Handle Custom Cell Input Change (The number -> string API scenario)
  onCustomCellChange(row: any, field: string, value: any) {
    // Mimik API call: send number, get string
    console.log(`Sending to server: ${value}`);

    setTimeout(() => {
      // Server responds with a string
      const serverString = `Server-${value}`;

      // Update the row object directly.
      // PrimeNG will automatically reflect this in the <ng-template pTemplate="output">
      row[field] = serverString;

      // If you need to emit to parent, do it here
      console.log(`String from server emitted to parent: ${serverString}`);
    }, 200);
  }

  // 1. Handle standard text/number/dropdown changes
  onStandardChange(table: any, row: any, field: string, value: any) {
    row[field] = value;
    // Mark as touched so validation checks run immediately
    table.markFieldTouched(row, field);
  }

  // 2. Handle the specific Number -> Server -> String scenario
  onCodeChange(table: any, row: any, value: number) {
    row['code'] = value;
    table.markFieldTouched(row, 'code'); // Mark touched immediately

    console.log(`Sending number to server: ${value}`);
    setTimeout(() => {
      const serverString = `Server-${value}`;
      row['code'] = serverString;
      table.markFieldTouched(row, 'code'); // Re-trigger validation after API updates the value
    }, 500);
  }

  onLazyLoad(event: any) {
    this.loading.set(true);
    // Call your API, then:
    // this.page.set(result.data);
    // this.total.set(result.total);
    this.loading.set(false);
  }

  onSave(event: BatchSaveEvent<TableItem>) {
    this.loading.set(true);

    setTimeout(() => {
      // 1. Create a Set of deleted IDs for fast lookup
      const deletedIds = new Set(event.deletes);

      // 2. Apply updates to existing rows, AND filter out deleted rows
      const updatesMap = new Map(event.updates.map((u: any) => [u.id, u]));

      // 2. Map over the CURRENT page to preserve exact order, applying updates if they exist
      const updatedPage = this.page()
        .filter((row: any) => !deletedIds.has(String(row.id)))
        .map((row: any) => {
          const updatedRow = updatesMap.get(row.id);
          return updatedRow ? { ...updatedRow } : row;
        });

      // 3. Simulate backend generating unique IDs for newly created rows
      const savedCreates = event.creates.map((p, index) => ({
        ...p,
        id: Date.now() + index,
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

  onCellEdit(e: { row: TableItem; field: string; value: unknown }) {
    // Optional side effects
  }

  onColumnsReorder(cols: TableColumnDefinition<TableItem>[]) {
    this.setColumnsToLocalStorage(cols);
    // persist to localStorage, etc.
  }

  onSelectedColumnsChange(event: TableColumnDefinition<TableItem>[]) {
    this.setColumnsToLocalStorage(event);
  }

  setColumnsToLocalStorage(cols: TableColumnDefinition<TableItem>[]) {
    localStorage.setItem(this.selectedColumnsKey(), JSON.stringify(cols));
  }
}
