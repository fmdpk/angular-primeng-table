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

  isRowValid(product: Product): boolean {
    return this.requiredFields.every(
      (field) => this.getFieldError(product, field) === null,
    );
  }

  hasAnyInvalid(rows: Product[]): boolean {
    return rows.some((product) => !this.isRowValid(product));
  }

  hasAnyInvalidNew(rows: Product[]): boolean {
    return rows.some((product) => product._isNew && !this.isRowValid(product));
  }

  markFieldTouched(product: Product, field: keyof ProductCore): void {
    product._touched ??= {};
    product._touched[field] = true;
  }

  markAllTouched(rows: Product[]): void {
    rows.forEach((product) => {
      product._touched ??= {};
      this.requiredFields.forEach((field) => {
        product._touched![field] = true;
      });
    });
  }

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

  isFieldTouched(product: Product, field: keyof ProductCore): boolean {
    return !!product._touched?.[field];
  }
}
