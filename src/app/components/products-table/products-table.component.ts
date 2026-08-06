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
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { CodeInputCellComponent } from '../code-input-cell/code-input-cell.component';

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

  readonly codeInputCell = viewChild('codeInputCell', {
    read: TemplateRef,
  });

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
      field: 'code',
      header: 'Code',
      faHeader: 'کد',
      width: '15%',
      // type: 'text',
      // template: this.codeInputCell(),
      // component: CodeInputCellComponent,
      component: () =>
        import('../code-input-cell/code-input-cell.component').then(
          (m) => m.CodeInputCellComponent,
        ),
    },
    {
      field: 'name',
      header: 'Name',
      faHeader: 'نام',
      width: '25%',
    },
    {
      field: 'category',
      header: 'Category',
      faHeader: 'دسته',
      width: '20%',
      type: 'select',
    },
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
  ]);

  // 1. Add categories for the select dropdown
  categories = ['دسته 1', 'دسته 2', 'دسته 3'];
  isDialogVisible = signal(false);
  selectedDialogRow = signal<any>(null);
  activeEditingRow = signal<any>(null);

  private fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  addRowForm = this.fb.group(
    this.columns().reduce(
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

    this.loading.set(true);
    setTimeout(() => {
      // Server responds with a string
      const serverString = `Server-${value}`;

      // Update the row object directly.
      // PrimeNG will automatically reflect this in the <ng-template pTemplate="output">
      row[field] = serverString;

      this.loading.set(false);
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

    this.loading.set(true);
    console.log(`Sending number to server: ${value}`);
    setTimeout(() => {
      const serverString = `Server-${value}`;
      row['code'] = serverString;
      table.markFieldTouched(row, 'code'); // Re-trigger validation after API updates the value
      this.loading.set(false);
    }, 500);
  }

  onLazyLoad(event: any) {
    this.loading.set(true);
    // Call your API, then:
    // this.page.set(result.data);
    // this.total.set(result.total);
    setTimeout(() => {

      this.loading.set(false);
    }, 500); // Simulate API delay
  }

  onSave(event: BatchSaveEvent<TableItem>) {
    setTimeout(() => {
      console.log(event)
      const deletedIds = new Set(event.deletes);
      const updatesMap = new Map(event.updates.map((u: any) => [u.id, u]));

      const updatedPage = this.page()
        .filter((row: any) => !deletedIds.has(String(row.id)))
        .map((row: any) => {
          const updatedRow = updatesMap.get(row.id);
          return updatedRow ? { ...updatedRow } : row;
        });

      const savedCreates = event.creates.map((p, index) => ({
        ...p,
        id: Date.now() + index,
      }));

      const tempIdToRealId = new Map<string, string>();
      event.creates.forEach((p: any, index: number) => {
        if (p._tempId) {
          tempIdToRealId.set(String(p._tempId), String(savedCreates[index].id));
        }
      });

      // 2. Translate the rowOrder array
      const translatedRowOrder = event.rowOrder.map((id) => {
        // If the ID was a tempId, replace it with the new real ID. Otherwise, keep it as is.
        return tempIdToRealId.get(String(id)) ?? String(id);
      });

      let finalPageData = [...savedCreates, ...updatedPage];

      if (translatedRowOrder && translatedRowOrder.length > 0) {
        finalPageData.sort((a: any, b: any) => {
          const idA = String(a.id);
          const idB = String(b.id);
          const idxA = translatedRowOrder.indexOf(idA);
          const idxB = translatedRowOrder.indexOf(idB);
          // If an ID isn't found in rowOrder, push it to the end
          return (
            (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB)
          );
        });
      }

      const cleanFinalData = finalPageData.map((row: any) => {
        const { _tempId, ...cleanRow } = row;
        return cleanRow;
      });

      console.log(cleanFinalData);

      this.page.set(cleanFinalData);
      this.total.set(this.page().length);

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

  onRowEditConfirm(event: { row: any; done: (success: boolean) => void }) {
    console.log('Sending row to API for pre-check:', event.row);

    this.loading.set(true);
    // Mimic API call
    setTimeout(() => {
      // Simulate 80% success rate. Change to `true` to always succeed.
      const success = Math.random() > 0.2;

      // Call the done callback to notify the child component
      event.done(success);
      this.loading.set(false);
    }, 500);
  }
}
