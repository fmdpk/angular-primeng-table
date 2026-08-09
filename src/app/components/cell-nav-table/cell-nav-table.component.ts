import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

interface CellCoordinates {
  rowIndex: number;
  colIndex: number;
}

@Component({
  selector: 'app-cell-nav-table',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, ToastModule],
  providers: [MessageService],
  templateUrl: './cell-nav-table.component.html',
  styleUrls: ['./cell-nav-table.component.scss'],
})
export class CellNavTableComponent {
  products = [
    {
      code: 'P100',
      name: 'Wireless Mouse',
      category: 'Electronics',
      price: 29.99,
    },
    {
      code: 'P101',
      name: 'Mechanical Keyboard',
      category: 'Electronics',
      price: 89.99,
    },
    {
      code: 'P102',
      name: 'Ergonomic Chair',
      category: 'Furniture',
      price: 199.99,
    },
    {
      code: 'P103',
      name: '27-inch Monitor',
      category: 'Electronics',
      price: 249.99,
    },
  ];

  columns = [
    { field: 'code', header: 'Code' },
    { field: 'name', header: 'Name' },
    { field: 'category', header: 'Category' },
    { field: 'price', header: 'Price' },
  ];

  selectedCell: CellCoordinates | null = null;

  constructor(private messageService: MessageService) {}

  selectCell(rowIndex: number, colIndex: number): void {
    this.selectedCell = { rowIndex, colIndex };
  }

  isSelected(rowIndex: number, colIndex: number): boolean {
    return (
      this.selectedCell?.rowIndex === rowIndex &&
      this.selectedCell?.colIndex === colIndex
    );
  }

  getCellValue(rowIndex: number, colIndex: number): string {
    const row = this.products[rowIndex];
    const col = this.columns[colIndex];
    if (!row || !col) return '';
    return String(row[col.field as keyof typeof row] ?? '');
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.selectedCell) return;

    const { rowIndex, colIndex } = this.selectedCell;

    // Detect RTL direction from document root or body
    const isRtl =
      document.documentElement.dir === 'rtl' ||
      document.body.dir === 'rtl' ||
      getComputedStyle(document.body).direction === 'rtl';

    // In RTL: ArrowLeft advances to next column, ArrowRight moves to previous column
    const nextColKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const prevColKey = isRtl ? 'ArrowRight' : 'ArrowLeft';

    if (event.key === nextColKey) {
      event.preventDefault();
      if (colIndex < this.columns.length - 1) {
        this.selectedCell = { rowIndex, colIndex: colIndex + 1 };
      }
    } else if (event.key === prevColKey) {
      event.preventDefault();
      if (colIndex > 0) {
        this.selectedCell = { rowIndex, colIndex: colIndex - 1 };
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (rowIndex < this.products.length - 1) {
        this.selectedCell = { rowIndex: rowIndex + 1, colIndex };
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (rowIndex > 0) {
        this.selectedCell = { rowIndex: rowIndex - 1, colIndex };
      }
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'c'
    ) {
      this.copyCellValue(rowIndex, colIndex);
    }
  }

  copyCellValue(
    rowIndex: number = this.selectedCell?.rowIndex ?? -1,
    colIndex: number = this.selectedCell?.colIndex ?? -1,
  ): void {
    if (rowIndex < 0 || colIndex < 0) return;

    const value = this.getCellValue(rowIndex, colIndex);
    navigator.clipboard.writeText(value).then(() => {
      this.messageService.add({
        severity: 'info',
        summary: 'Copied',
        detail: `Copied "${value}" to clipboard`,
        life: 2000,
      });
    });
  }
}
