import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyDisplay',
  standalone: true,
})
export class CurrencyDisplayPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null || Number.isNaN(Number(value))) {
      return '—';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(Number(value));
  }
}
