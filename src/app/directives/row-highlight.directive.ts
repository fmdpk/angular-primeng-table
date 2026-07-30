import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  Renderer2,
} from '@angular/core';

@Directive({
  selector: '[appRowHighlight]',
  standalone: true,
})
export class RowHighlightDirective implements OnChanges {
  @Input('appRowHighlight') isActive = false;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isActive']) {
      if (this.isActive) {
        this.renderer.addClass(this.elementRef.nativeElement, 'row-highlight');
      } else {
        this.renderer.removeClass(
          this.elementRef.nativeElement,
          'row-highlight',
        );
      }
    }
  }
}
