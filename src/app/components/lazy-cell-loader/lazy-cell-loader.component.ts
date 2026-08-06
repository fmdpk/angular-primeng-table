import { Component, Input, Type, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';

@Component({
  selector: 'app-lazy-cell-loader',
  standalone: true,
  imports: [NgComponentOutlet],
  templateUrl: `./lazy-cell-loader.component.html`,
  host: { style: 'display: contents' },
})
export class LazyCellLoaderComponent {
  @Input() set component(
    comp: Type<any> | (() => Promise<Type<any>>) | undefined,
  ) {
    if (!comp) return;

    // 1. Check if it's an arrow function (lazy loader)
    // Arrow functions don't have a 'prototype' property, but classes do.
    if (typeof comp === 'function' && !(comp as any).prototype) {
      // 2. Cast it to the lazy loader type and execute it
      (comp as () => Promise<Type<any>>)().then((c) =>
        this.resolvedComponent.set(c),
      );
    } else {
      // 3. It's a direct class constructor, just set it
      this.resolvedComponent.set(comp as Type<any>);
    }
  }

  @Input() inputs: any;

  readonly resolvedComponent = signal<Type<any> | null>(null);
}
