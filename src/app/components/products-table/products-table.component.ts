import {
  Component,
  computed,
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
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { HttpClient } from '@angular/common/http';

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
    DialogModule,
    TableModule,
  ],
  templateUrl: './products-table.component.html',
})
export class ProductsTableComponent implements OnInit {
  // References to templates
  readonly batchTable = viewChild(BatchTableComponent<TableItem>);
  @ViewChild('headerForm') headerForm!: TemplateRef<any>;
  @ViewChild('customCellInput') customCellInput!: TemplateRef<any>;

  http = inject(HttpClient);

  // readonly codeInputCell = viewChild('codeInputCell', {
  //   read: TemplateRef,
  // });

  readonly selectedColumnsKey = signal('PRODUCT_TABLE_SELECTED_COLUMNS');
  readonly page = signal<TableItem[]>([]);
  readonly total = signal(0);
  readonly rows = signal(5);
  readonly userSelectedRows = signal(5);
  readonly loading = signal(false);
  private readonly platformId = inject(PLATFORM_ID);
  readonly isBrowser = isPlatformBrowser(this.platformId);
  initialSelectedColumns = signal<TableColumnDefinition<TableItem>[]>([]);

  readonly columns = computed<TableColumnDefinition<TableItem>[]>(() => [
    {
      field: 'title',
      header: 'Title',
      faHeader: 'عنوان',
      // width: '15%',
      // type: 'text',
      // template: this.codeInputCell(),
      // component: CodeInputCellComponent,
      // component: () =>
      //   import('../code-input-cell/code-input-cell.component').then(
      //     (m) => m.CodeInputCellComponent,
      //   ),
    },
    {
      field: 'status',
      header: 'Status',
      faHeader: 'وضعیت',
      width: '25%',
      type: 'select',
    },
    {
      field: 'createdAt',
      header: 'CreatedAt',
      faHeader: 'زمان ثبت',
      convertCellOutput: (cellInput) => {
        return new Date(cellInput).toLocaleDateString('fa');
      },
      hideInput: true,
      // width: '20%',
      // type: 'select',
    },
    {
      field: 'updatedAt',
      header: 'updatedAt',
      faHeader: 'آخرین ویرایش',
      convertCellOutput: (cellInput) => {
        return new Date(cellInput).toLocaleDateString('fa');
      },
      hideInput: true,
      // width: '15%',
      // type: 'text',
    },
    {
      field: 'createUser',
      header: 'CreateUser',
      faHeader: 'کاربر ثبت کننده',
      hideInput: true,
      // width: '25%',
      // type: 'text',
    },
  ]);

  status = [
    { name: 'in progress', code: 'in progress' },
    { name: 'pending', code: 'pending' },
    { name: 'done', code: 'done' },
  ];

  // isDialogVisible = signal(false);
  // selectedDialogRow = signal<any>(null);
  // activeEditingRow = signal<any>(null);
  // dialogProducts = [
  //   { id: 1, code: 'PRD-001', name: 'لپ تاپ' },
  //   { id: 2, code: 'PRD-002', name: 'موس' },
  //   { id: 3, code: 'PRD-003', name: 'کیبورد' },
  // ];

  private fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  addRowForm = this.fb.group({
    title: ['', Validators.required],
    status: ['', Validators.required],
    createdAt: [''],
    updatedAt: [''],
    createUser: [''],
  });

  readonly validators: Partial<Record<string, ValidatorFn<TableItem>>> = {
    title: (v) => (v ? null : 'عنوان را وارد کنید'),
    status: (v) => (v ? null : 'وضعیت را وارد کنید'),
    // updatedAt: (v) =>
    //   v === '' || v == null
    //     ? 'تعداد الزامی است'
    //     : Number.isNaN(Number(v)) || Number(v) < 0
    //       ? 'مقدار ≥ 0'
    //       : null,
  };

  ngOnInit(): void {
    if (this.isBrowser) {
      this.restoreColumns();
      // this.onLazyLoad();
    }
  }

  restoreColumns() {
    const savedFieldsStr = localStorage.getItem(this.selectedColumnsKey());
    const allColumns = this.columns();

    if (savedFieldsStr) {
      try {
        const savedFields = JSON.parse(savedFieldsStr) as string[];

        // 1. Reconstruct the full column objects in the saved order
        const reconstructedColumns = savedFields
          .map((field) => allColumns.find((col) => col.field === field))
          .filter(
            (col) => col !== undefined,
          ) as TableColumnDefinition<TableItem>[];

        // 2. Append any new columns that were added to the code but aren't in localStorage yet
        allColumns.forEach((col) => {
          if (!reconstructedColumns.find((c) => c.field === col.field)) {
            reconstructedColumns.push(col);
          }
        });

        this.initialSelectedColumns.set(reconstructedColumns);
      } catch (e) {
        // Fallback to default columns if JSON is corrupted
        this.initialSelectedColumns.set(allColumns);
      }
    } else {
      // First time loading, use default order
      this.initialSelectedColumns.set(allColumns);
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
    console.log('Submitting new row:', formValue);
    this.loading.set(true);

    setTimeout(() => {
      const serverResponse = { ...formValue, id: Date.now() };

      // Call the child component using the viewChild signal
      const table = this.batchTable();
      if (table) {
        table.addDraftRow(serverResponse);
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

  onCustomCellChange(
    table: any,
    row: any,
    field: string,
    value: any,
    hasServerValidation?: boolean,
  ) {
    if (!hasServerValidation) {
      row[field] = value;
      return;
    }

    this.loading.set(true);
    setTimeout(() => {
      value = value.replace('Server-', '');
      const serverString = `Server-${value}`;

      row[field] = serverString;
      table.markFieldTouched(row, field);
      this.loading.set(false);
    }, 200);
  }

  onStandardChange(table: any, row: any, field: string, value: any) {
    row[field] = value;
    table.markFieldTouched(row, field);
  }

  onApiFieldChange(table: any, row: any, field: string, value: any) {
    row[field] = value;
    this.loading.set(true);
    setTimeout(() => {
      table.markFieldTouched(row, field);
      this.loading.set(false);
    }, 500);
  }

  onLazyLoad(event?: any) {
    this.loading.set(true);
    this.http.get<TableItem[]>('http://localhost:3000/items').subscribe({
      next: (res: TableItem[]) => {
        this.page.set(res);
        this.total.set(res.length);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
      },
    });
  }

  onSave(event: BatchSaveEvent<TableItem>) {
    console.log('Batch save event:', event);
    this.loading.set(true);
    this.http
      .post<TableItem[]>('http://localhost:3000/items', event)
      .subscribe({
        next: (res: TableItem[]) => {
          event.done(true);
          this.onLazyLoad();
        },
        error: (error) => {
          this.loading.set(false);
        },
      });
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
    const fields = cols.map((col) => col.field);
    localStorage.setItem(this.selectedColumnsKey(), JSON.stringify(fields));
  }

  onRowEditConfirm(event: { row: any; done: (success: boolean) => void }) {
    this.loading.set(true);
    setTimeout(() => {
      const success = Math.random() > 0.2;

      event.done(success);
      this.loading.set(false);
    }, 500);
  }

  // how to give column cell a template reference to open a dialog and select a value from the dialog and set it to the cell value
  // openProductDialog(row: any, table: any) {
  //   this.activeEditingRow.set(row);
  //   this.selectedDialogRow.set(null);
  //   this.isDialogVisible.set(true);
  //   // Mark field touched so validation shows if they try to save without selecting
  //   table.markFieldTouched(row, 'code');
  // }

  // confirmDialogSelection() {
  //   const row = this.activeEditingRow();
  //   const selected = this.selectedDialogRow();
  //   if (row && selected) {
  //     // Simulate API response replacing the value
  //     row['code'] = selected.code;

  //     // Mark as touched again to re-validate the new value
  //     // (Assuming batchTable is accessible, otherwise pass 'table' reference)
  //     this.batchTable()?.markFieldTouched(row, 'code');
  //   }
  //   this.isDialogVisible.set(false);
  // }
}
