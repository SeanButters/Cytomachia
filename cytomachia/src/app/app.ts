import { Component, signal } from '@angular/core';
import { GpuCanvasComponent } from './simulationControl/simulation-window';

@Component({
  selector: 'app-root',
  imports: [GpuCanvasComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('cytomachia');
}
