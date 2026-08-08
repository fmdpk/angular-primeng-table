import { Component, computed, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { PopoverModule } from 'primeng/popover';

@Component({
  selector: 'app-code-input-cell-overlay',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    DialogModule,
    TableModule,
    PopoverModule,
  ],
  templateUrl: './code-input-cell-overlay.component.html',
})
export class CodeInputCellOverlayComponent {
  @Input() row: any;
  @Input() column: any;
  @Input() table: any;

  isDialogVisible = signal(false);
  selectedDialogRow = signal<any>(null);

  searchQuery = signal('');

  dialogProducts = [
    { id: 1, code: 'PRD-001', name: 'لپ تاپ' },
    { id: 2, code: 'PRD-002', name: 'موس' },
    { id: 3, code: 'PRD-003', name: 'کیبورد' },
  ];

  onChange(value: any) {
    this.row[this.column.field] = value;
    this.table.markFieldTouched(this.row, this.column.field);
  }

  openDialog() {
    this.selectedDialogRow.set(null);
    this.isDialogVisible.set(true);
  }

  confirmSelection() {
    const selected = this.selectedDialogRow();
    if (selected) {
      this.row[this.column.field] = selected.code;
      this.table.markFieldTouched(this.row, this.column.field);
    }
    this.isDialogVisible.set(false);
  }

  filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.dialogProducts.filter(
      (p) => p.code.toLowerCase().includes(q) || p.name.includes(q),
    );
  });

  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
  }

  onSelect(product: any) {
    this.row[this.column.field] = product.code;
    this.table.markFieldTouched(this.row, this.column.field);
  }
}
