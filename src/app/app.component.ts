import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CellNavTableComponent } from './components/cell-nav-table/cell-nav-table.component';
import { ProductsTableComponent } from './components/products-table/products-table.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ButtonModule,
    ProductsTableComponent,
    CellNavTableComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'angular-primeng-table';
}
