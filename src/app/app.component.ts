import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProductsTableComponent } from './components/products-table/products-table.component';
import { CellNavTableComponent } from './components/cell-nav-table/cell-nav-table.component';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    ButtonModule,
    ProductsTableComponent,
    CellNavTableComponent,
  ],
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'angular-primeng-table';
}
