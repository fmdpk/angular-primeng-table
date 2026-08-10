import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  signal,
} from '@angular/core';
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
  host: {
    tabindex: '0',
    '(focusin)': 'onFocus()',
    '(focusout)': 'onBlur($event)',
  },
})
export class CellNavTableComponent {
  @Output() rowSelect = new EventEmitter<any>();

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

  // Detect clicks anywhere on the document
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const clickedInside = this.el.nativeElement.contains(event.target as Node);
    if (!clickedInside) {
      this.isFocused = false;
      this.selectedCell = null; // Clears the selection state when clicking outside
    }
  }

  // Track focus for this table instance
  isFocused = false;
  dir: 'ltr' | 'rtl' = 'rtl'; // Default direction, can be set dynamically

  // Selected row tracking (adjust types to match your model)
  selectedRow = signal<any | null>(null);

  constructor(
    private messageService: MessageService,
    private el: ElementRef,
  ) {}

  onFocus(): void {
    this.isFocused = true;
  }

  onBlur(event: FocusEvent): void {
    // Only remove focus if the new focus target is outside this table component
    if (!this.el.nativeElement.contains(event.relatedTarget as Node)) {
      this.isFocused = false;
    }
  }

  selectCell(rowIndex: number, colIndex: number, event?: MouseEvent): void {
    // Prevent document:click from instantly clearing selection when a cell is clicked
    if (event) {
      event.stopPropagation();
    }

    this.isFocused = true;
    this.selectedCell = { rowIndex, colIndex };

    const rowToSelect = this.products[rowIndex];
    if (rowToSelect) {
      this.selectRow(rowToSelect);
    }
  }

  selectRow(row: any): void {
    this.selectedRow.set(row);
    this.rowSelect.emit(row);
  }

  isSelected(rowIndex: number, colIndex: number): boolean {
    return (
      this.isFocused &&
      this.selectedCell?.rowIndex === rowIndex &&
      this.selectedCell?.colIndex === colIndex
    );
  }

  getCellValue(rowIndex: number, colIndex: number): string {
    console.log(this.products);
    const row = this.products[rowIndex];
    const col = this.columns[colIndex];
    if (!row || !col) return '';
    return String(row[col.field as keyof typeof row] ?? '');
  }

  @HostListener('keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.selectedCell) return;

    const target = event.target as HTMLElement;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    const { rowIndex, colIndex } = this.selectedCell;
    const maxRowIndex = this.products.length - 1;
    const maxColIndex = this.columns.length - 1;

    const isRtl =
      this.dir === 'rtl' ||
      document.documentElement.dir === 'rtl' ||
      document.body.dir === 'rtl';

    const nextColKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const prevColKey = isRtl ? 'ArrowRight' : 'ArrowLeft';

    const handledKeys = [
      nextColKey,
      prevColKey,
      'ArrowDown',
      'ArrowUp',
      ' ',
      'Space',
    ];

    // Check if the pressed key is handled by navigation
    if (handledKeys.includes(event.key) || event.code === 'Space') {
      // Stop the event from reaching window listeners on other tables
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    // 1. Space Key Row Selection
    if (event.key === ' ' || event.code === 'Space') {
      const rowToSelect = this.products[rowIndex];
      if (rowToSelect) {
        this.selectRow(rowToSelect);
      }
      return;
    }

    // 2. Navigation Logic
    if (event.key === nextColKey) {
      if (colIndex < maxColIndex) {
        this.selectedCell = { rowIndex, colIndex: colIndex + 1 };
      }
    } else if (event.key === prevColKey) {
      if (colIndex > 0) {
        this.selectedCell = { rowIndex, colIndex: colIndex - 1 };
      }
    } else if (event.key === 'ArrowDown') {
      if (rowIndex < maxRowIndex) {
        this.selectedCell = { rowIndex: rowIndex + 1, colIndex };
      }
    } else if (event.key === 'ArrowUp') {
      if (rowIndex > 0) {
        this.selectedCell = { rowIndex: rowIndex - 1, colIndex };
      }
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'c'
    ) {
      this.copyCellValue();
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
