import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-code-input-cell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    DialogModule,
    TableModule,
  ],
  templateUrl: './code-input-cell.component.html',
})
export class CodeInputCellComponent {
  @Input() row: any;
  @Input() column: any;
  @Input() table: any;

  isDialogVisible = signal(false);
  selectedDialogRow = signal<any>(null);

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
}
