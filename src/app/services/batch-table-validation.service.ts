import { Injectable } from '@angular/core';
import { Product, ProductCore } from '../models/product';

@Injectable({ providedIn: 'root' })
export class BatchTableValidationService {
  private readonly requiredFields: (keyof ProductCore)[] = [
    'code',
    'name',
    'quantity',
    'price',
  ];

  /**
   * Returns the validation error message for a field on a product.
   */
  getFieldError(product: Product, field: keyof ProductCore): string | null {
    const raw = product[field];
    const value = raw == null ? '' : String(raw).trim();

    switch (field) {
      case 'code':
        return value ? null : 'کد را وارد کنید';
      case 'name':
        return value ? null : 'نام را وارد کنید';
      case 'quantity':
        if (value === '') return 'تعداد الزامی است';
        if (Number.isNaN(Number(value)) || Number(value) < 0)
          return 'مقدار ≥ 0';
        return null;
      case 'price':
        if (value === '') return 'قیمت را وارد کنید';
        if (Number.isNaN(Number(value)) || Number(value) < 0)
          return 'مقدار ≥ 0';
        return null;
      default:
        return null;
    }
  }

  /**
   * Determines whether a product row passes validation.
   */
  isRowValid(product: Product): boolean {
    return this.requiredFields.every(
      (field) => this.getFieldError(product, field) === null,
    );
  }

  /**
   * Checks whether any supplied rows are invalid.
   */
  hasAnyInvalid(rows: Product[]): boolean {
    return rows.some((product) => !this.isRowValid(product));
  }

  /**
   * Checks whether any newly added rows are invalid.
   */
  hasAnyInvalidNew(rows: Product[]): boolean {
    return rows.some((product) => product._isNew && !this.isRowValid(product));
  }

  /**
   * Marks a field as touched so validation state can be shown.
   */
  markFieldTouched(product: Product, field: keyof ProductCore): void {
    product._touched ??= {};
    product._touched[field] = true;
  }

  /**
   * Marks every required field in each row as touched.
   */
  markAllTouched(rows: Product[]): void {
    rows.forEach((product) => {
      product._touched ??= {};
      this.requiredFields.forEach((field) => {
        product._touched![field] = true;
      });
    });
  }

  /**
   * Marks every required field in each new row as touched.
   */
  markAllNewTouched(rows: Product[]): void {
    rows
      .filter((product) => product._isNew)
      .forEach((product) => {
        product._touched ??= {};
        this.requiredFields.forEach((field) => {
          product._touched![field] = true;
        });
      });
  }

  /**
   * Returns whether a field has been marked as touched.
   */
  isFieldTouched(product: Product, field: keyof ProductCore): boolean {
    return !!product._touched?.[field];
  }
}
