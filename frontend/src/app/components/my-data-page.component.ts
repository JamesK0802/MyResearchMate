import { Component } from '@angular/core';

/** Shared outer spacing for every saved-data page; feature editors remain projected. */
@Component({
  selector: 'app-my-data-page',
  standalone: true,
  template: '<ng-content></ng-content>',
  styles: [`
    :host { display:block; box-sizing:border-box; padding:var(--space-6) var(--space-6) var(--space-8); max-width:var(--page-max-width); margin:0 auto; min-height:80vh; }
    @media(max-width:600px) { :host { padding:14px 12px 24px; } }
  `]
})
export class MyDataPageComponent {}
